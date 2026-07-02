import { createAdminClient } from "@/lib/supabase/admin";
import { sendSessionReminder, sendAccessCode, sendCreditsExpiring } from "@/lib/email";
import { getNukiConfig, ensureBookingKeypadCode } from "@/lib/nuki";
import { getGymSecrets } from "@/lib/gym-secrets";
import { notify } from "@/lib/notify";

// Day-before reminders: email members whose confirmed session starts ~1 day out (run daily by cron).
// reminder_sent guards against duplicates regardless of exact cron timing.
export async function sendDueReminders() {
  const admin = createAdminClient();
  const from = new Date(Date.now() + 6 * 3600000).toISOString();
  const to = new Date(Date.now() + 30 * 3600000).toISOString();
  const { data: rows } = await admin
    .from("bookings")
    .select("id, starts_at, ends_at, services(name), member:profiles!bookings_user_id_fkey(email, full_name), coach:profiles!bookings_coach_id_fkey(full_name)")
    .eq("status", "bevestigd")
    .eq("reminder_sent", false)
    .gte("starts_at", from)
    .lt("starts_at", to);

  let sent = 0;
  for (const b of rows || []) {
    let ok = true; // no e-mail on file → nothing to send, don't retry
    if (b.member?.email) {
      ok = false;
      try {
        const r = await sendSessionReminder({
          to: b.member.email,
          name: b.member.full_name,
          serviceName: b.services?.name || "Sessie",
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          coachName: b.coach?.full_name,
        });
        ok = r?.ok !== false; // only mark sent when the mail actually went out
        if (ok) sent++;
      } catch (e) { console.error("reminder send threw:", b.id, e?.message); }
    }
    // Only flip reminder_sent when it succeeded, so a transient failure retries next cron tick
    // (the +6h..+30h window keeps this bounded — no infinite ret/spam after the session passes).
    if (ok) await admin.from("bookings").update({ reminder_sent: true }).eq("id", b.id);
  }
  return sent;
}

// Warn members whose remaining PAID credits expire within 14 days (run daily by cron). Paid
// sessions previously evaporated with zero warning anywhere. Dedup: at most one warning per member
// per 14 days, via the in-app notification trail.
export async function sendCreditExpiryWarnings() {
  const admin = createAdminClient();
  const { data: users } = await admin.from("credits_ledger").select("user_id, gym_id");
  const seen = new Map();
  for (const r of users || []) if (!seen.has(r.user_id)) seen.set(r.user_id, r.gym_id);

  const horizon = Date.now() + 14 * 86400000;
  const dedupSince = new Date(Date.now() - 14 * 86400000).toISOString();
  let warned = 0;
  for (const [userId, gymId] of seen) {
    try {
      const { data: rows } = await admin.rpc("credits_balance_detail", { p_user: userId });
      const d = Array.isArray(rows) ? rows[0] : rows;
      if (!d?.next_expiry || !(d.expiring > 0)) continue;
      const exp = new Date(d.next_expiry).getTime();
      if (exp > horizon || exp < Date.now()) continue;
      // Already warned in this window? (notification trail doubles as the dedup marker)
      const { count } = await admin.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("type", "credits").ilike("title", "%vervalt binnenkort%").gte("created_at", dedupSince);
      if (count) continue;
      const dateStr = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long" }).format(new Date(d.next_expiry));
      await notify({ gymId, userId, type: "credits", title: `${d.expiring === 1 ? "1 sessie" : `${d.expiring} sessies`} vervalt binnenkort`, body: `Geldig tot ${dateStr} — boek ze in!`, link: "/boeken" });
      const { data: m } = await admin.from("profiles").select("email, full_name").eq("id", userId).single();
      if (m?.email) await sendCreditsExpiring({ to: m.email, name: m.full_name, count: d.expiring, date: dateStr });
      warned++;
    } catch (e) { console.error("credit expiry warning failed:", userId, e?.message); }
  }
  return warned;
}

// Access codes: ~5 minutes before a confirmed session starts, e-mail the entry code + directions.
// access_sent guards against repeats; the window is a few minutes wide so a 5-min cron never misses one.
export async function sendDueAccessCodes() {
  const admin = createAdminClient();
  // Wide window so we never miss a session: catch ones starting soon AND ones that just started
  // (cron can lag, or a member books last-minute). Per booking we gate on the gym's lead time below.
  const from = new Date(Date.now() - 20 * 60000).toISOString();
  const to = new Date(Date.now() + 16 * 60000).toISOString();
  const { data: rows } = await admin
    .from("bookings")
    .select("id, gym_id, user_id, starts_at, ends_at, nuki_auth_name, services(name), gym:gyms(access_info, address), member:profiles!bookings_user_id_fkey(email, full_name)")
    .eq("status", "bevestigd")
    .eq("access_sent", false)
    .or("paid.eq.true,payment_source.in.(credit,gratis_code)") // never hand a door code to an unpaid los/abo booking
    .gte("starts_at", from)
    .lt("starts_at", to);

  const secretsByGym = new Map(); // static door code (0102) is per-gym; fetch once, reuse across rows
  const staticCode = async (gymId) => {
    if (!secretsByGym.has(gymId)) secretsByGym.set(gymId, (await getGymSecrets(admin, gymId)).access_code);
    return secretsByGym.get(gymId);
  };
  let sent = 0;
  for (const b of rows || []) {
    const address = b.gym?.address || "Aannemersstraat 186, 9040 Gent";
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

    let cfg = null;
    try { cfg = await getNukiConfig(admin, b.gym_id); } catch {}
    const leadMin = cfg?.leadMin ?? 5;
    // Too early for this booking's lead window → leave it for a later cron tick (access_sent stays false).
    if (Date.now() < new Date(b.starts_at).getTime() - leadMin * 60000) continue;
    // Session already finished → don't send a code, just stop re-checking this one.
    if (Date.now() > new Date(b.ends_at).getTime()) { await admin.from("bookings").update({ access_sent: true }).eq("id", b.id); continue; }

    // Atomically claim this booking so two overlapping cron runs can't both mint a code for it.
    const { data: claimed } = await admin.from("bookings").update({ access_sent: true }).eq("id", b.id).eq("access_sent", false).select("id");
    if (!claimed || !claimed.length) continue;

    // When the Nuki lock is enabled, mint a fresh per-booking keypad code valid only during the slot.
    // Otherwise (or if Nuki fails) fall back to the static gym code so a member is never locked out.
    let code = await staticCode(b.gym_id);
    let personal = false;
    if (cfg?.enabled) {
      try {
        code = await ensureBookingKeypadCode(admin, cfg, b);
        personal = true;
      } catch {
        code = await staticCode(b.gym_id); // fail-safe fallback
      }
    }

    if (b.member?.email) {
      try {
        await sendAccessCode({
          to: b.member.email,
          name: b.member.full_name,
          serviceName: b.services?.name || "Sessie",
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          accessCode: code,
          personal,
          address,
          mapsUrl,
        });
        sent++;
      } catch {}
    }
    // In-app backup (bell + /account) so a time-sensitive code reaches the member even if e-mail lags.
    if (code) {
      await notify({
        gymId: b.gym_id,
        userId: b.user_id,
        type: "system",
        title: "Je toegangscode 🔑",
        body: `Code ${code}${personal ? " — werkt enkel tijdens je sessie." : ""}`,
        link: "/account",
      });
    }
  }
  return sent;
}
