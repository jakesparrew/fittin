import { createAdminClient } from "@/lib/supabase/admin";
import { sendSessionReminder, sendGuestSessionReminder, sendAccessCode, sendCreditsExpiring, sendCreditsEmpty, sendFirstSessionFollowup, sendGuestFollowup, sendAboSuggestion } from "@/lib/email";
import { getNukiConfig, ensureBookingKeypadCode, getLockHealth } from "@/lib/nuki";
import { getGymSecrets } from "@/lib/gym-secrets";
import { notify } from "@/lib/notify";
import { isSettled } from "@/lib/booking-status";
import { evaluateMatches } from "@/lib/activation";
import { enrollMemberInTargetDrip } from "@/lib/newsletter";

// Day-before reminders: email members whose confirmed session starts ~1 day out (run daily by cron).
// reminder_sent guards against duplicates regardless of exact cron timing.
export async function sendDueReminders() {
  const admin = createAdminClient();
  const from = new Date(Date.now() + 6 * 3600000).toISOString();
  const to = new Date(Date.now() + 30 * 3600000).toISOString();
  const { data: rows } = await admin
    .from("bookings")
    .select("id, starts_at, ends_at, paid, price_cents, payment_source, services(name), gym:gyms(address), member:profiles!bookings_user_id_fkey(email, full_name), coach:profiles!bookings_coach_id_fkey(full_name)")
    .eq("status", "bevestigd")
    .eq("reminder_sent", false)
    .gte("starts_at", from)
    .lt("starts_at", to);

  // Meegenodigden van dezelfde sessies. Zij kregen tot nu enkel de uitnodiging op het moment van
  // boeken — een dag vooraf hoorden ze niets, terwijl juist zij het snelst vergeten op te dagen.
  // Eén batch voor alle boekingen samen, zodat dit geen query per boeking wordt.
  const ids = (rows || []).map((b) => b.id);
  const guestsByBooking = new Map();
  if (ids.length) {
    const push = (bid, g) => { const l = guestsByBooking.get(bid) || []; l.push(g); guestsByBooking.set(bid, l); };
    const [{ data: parts }, { data: invs }] = await Promise.all([
      admin.from("booking_participants").select("booking_id, member:profiles!booking_participants_user_id_fkey(email, full_name)").in("booking_id", ids),
      admin.from("email_invites").select("booking_id, email").in("booking_id", ids),
    ]);
    for (const p of parts || []) if (p.member?.email) push(p.booking_id, { email: p.member.email, name: p.member.full_name });
    for (const i of invs || []) if (i.email) push(i.booking_id, { email: i.email, name: null });
  }

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
          bookingId: b.id, // → agenda-item als bijlage (zelfde UID als de bevestigingsmail)
          address: b.gym?.address,
        });
        ok = r?.ok !== false; // only mark sent when the mail actually went out
        if (ok) sent++;
      } catch (e) { console.error("reminder send threw:", b.id, e?.message); }
    }
    // Genodigden en gasten: enkel wanneer de sessie vaststaat. Een onbetaalde 'los'-boeking kan
    // nog vervallen; dan zou de gast voor een gesloten deur staan. Bewust binnen dezelfde `ok` als
    // de boeker: is de mail naar de boeker mislukt, dan blijft reminder_sent false en probeert de
    // volgende cronbeurt opnieuw — zonder deze voorwaarde kregen de gasten dan elke beurt een mail.
    if (ok && isSettled(b)) {
      const seen = new Set([String(b.member?.email || "").toLowerCase()]);
      for (const g of guestsByBooking.get(b.id) || []) {
        const to = String(g.email || "").toLowerCase().trim();
        if (!to || seen.has(to)) continue;
        seen.add(to);
        try {
          await sendGuestSessionReminder({
            to,
            name: g.name,
            fromName: b.member?.full_name,
            serviceName: b.services?.name || "Sessie",
            startsAt: b.starts_at,
            endsAt: b.ends_at,
          });
        } catch (e) { console.error("guest reminder send threw:", b.id, e?.message); }
      }
    }
    // Only flip reminder_sent when it succeeded, so a transient failure retries next cron tick
    // (the +6h..+30h window keeps this bounded — no infinite ret/spam after the session passes).
    if (ok) await admin.from("bookings").update({ reminder_sent: true }).eq("id", b.id);
  }
  return sent;
}

// Alle leden die ooit een tegoedbeweging hadden → Map(user_id → gym_id).
// PostgREST levert standaard maximaal 1000 rijen terug ZONDER foutmelding. Het grootboek groeit
// met elke boeking, dus vanaf ~1000 rijen zou de sweep hieronder stilletjes de nieuwste leden
// overslaan en hun betaalde beurten laten vervallen zonder waarschuwing. Vandaar pagineren.
async function ledgerUsers(admin) {
  const seen = new Map();
  const PAGE = 1000;
  for (let page = 0; page < 200; page++) { // harde bovengrens: 200k rijen, dan is er iets anders mis
    const { data, error } = await admin
      .from("credits_ledger")
      .select("user_id, gym_id")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) { console.error("credits_ledger page failed:", error.message); break; }
    for (const r of data || []) if (!seen.has(r.user_id)) seen.set(r.user_id, r.gym_id);
    if (!data || data.length < PAGE) break;
  }
  return seen;
}

// Warn members whose remaining PAID credits expire within 14 days (run daily by cron). Paid
// sessions previously evaporated with zero warning anywhere. Dedup: at most one warning per member
// per 14 days, via the in-app notification trail.
export async function sendCreditExpiryWarnings() {
  const admin = createAdminClient();
  const seen = await ledgerUsers(admin);

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

// Sessietegoed op (overgang 1 → 0). Het moment met de hoogste koopintentie van de hele
// levenscyclus: het lid wíl trainen en heeft net niets meer. Detectie zonder extra kolom: wie in
// de laatste 36u een negatieve grootboekbeweging had én nu op 0 staat, is net leeggelopen.
// Bewust NIET voor abonnees (die krijgen elke maand hun inbegrepen sessie terug — dat zou een
// maandelijkse "je saldo is op"-mail worden) en niet voor coaches (die hebben hun eigen
// saldowaarschuwing op het coach-dashboard).
export async function sendCreditsEmptyWarnings() {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 36 * 3600000).toISOString();
  const { data: recent } = await admin
    .from("credits_ledger")
    .select("user_id, gym_id, created_at")
    .lt("delta", 0)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  const seen = new Map();
  for (const r of recent || []) if (!seen.has(r.user_id)) seen.set(r.user_id, r.gym_id);

  const dedupSince = new Date(Date.now() - 60 * 86400000).toISOString();
  let warned = 0;
  for (const [userId, gymId] of seen) {
    try {
      const { data: m } = await admin.from("profiles").select("email, full_name, role").eq("id", userId).maybeSingle();
      if (m?.role !== "lid") continue;
      const { data: bal } = await admin.rpc("credits_balance", { p_user: userId });
      if (Number(bal ?? 0) > 0) continue;
      const { count: abo } = await admin.from("memberships").select("id", { count: "exact", head: true })
        .eq("user_id", userId).in("status", ["actief", "past_due"]);
      if (abo) continue;
      // Al gewaarschuwd in dit venster? Het belletje is meteen de dedupe-markering, net als bij de
      // vervalwaarschuwing hierboven.
      const { count: already } = await admin.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("type", "credits").ilike("title", "%saldo is op%").gte("created_at", dedupSince);
      if (already) continue;
      await notify({ gymId, userId, type: "credits", title: "Je sessiesaldo is op", body: "Boek gewoon los aan € 15, of vul je saldo weer aan.", link: "/lidmaatschap" });
      // De mail alleen wanneer er níéts gepland staat. Wie net met zijn laatste beurt boekte, las
      // het al in zijn bevestigingsmail — twee berichten over hetzelfde saldo is spam.
      const { count: upcoming } = await admin.from("bookings").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "bevestigd").gte("starts_at", nowIso);
      if (!upcoming && m?.email) await sendCreditsEmpty({ to: m.email, name: m.full_name });
      warned++;
    } catch (e) { console.error("credits-empty warning failed:", userId, e?.message); }
  }
  return warned;
}

// Comeback-reeks automatisch starten. Er wordt hier bewust niets nieuws gebouwd: de reeks (2 mails
// over 5 dagen) staat al in lib/insight-mails.js en de inschrijving bestaat al — ze vertrok alleen
// nooit vanzelf, want een beheerder moest elk lid met de hand in de reeks zetten. Gevolg: er ging
// tot nu geen enkele automatische comeback-mail buiten.
// Idempotent via drip_enrollments (uniek per campagne+abonnee): een lid komt hoogstens één keer in
// de reeks terecht, ook als het later opnieuw uitvalt. Dagelijkse limiet omdat een eerste run
// anders de hele inactieve lijst in één keer aanschrijft.
export async function startComebackSeries({ days = 30, max = 15 } = {}) {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: gyms } = await admin.from("gyms").select("id");
  let started = 0;
  for (const g of gyms || []) {
    if (started >= max) break;
    let matches = [];
    try {
      matches = await evaluateMatches(admin, g.id, "inactive", { days }); // respecteert uitschrijvingen
    } catch (e) { console.error("comeback matches failed:", g.id, e?.message); continue; }
    for (const m of matches) {
      if (started >= max) break;
      try {
        // Wie intussen alweer geboekt heeft, is geen comeback-geval meer.
        const { count: upcoming } = await admin.from("bookings").select("id", { count: "exact", head: true })
          .eq("user_id", m.user_id).eq("status", "bevestigd").gte("starts_at", nowIso);
        if (upcoming) continue;
        const r = await enrollMemberInTargetDrip(g.id, m.user_id, "comeback_reeks");
        if (r?.ok) started++;
      } catch (e) { console.error("comeback enroll failed:", m.user_id, e?.message); }
    }
  }
  return started;
}

// Post-first-session follow-up: members whose FIRST session ended 2–24h ago get a "hoe was het?"
// mail with an honest pricing recap + rebook CTA. Idempotent via profiles.first_followup_sent
// (backfilled true for everyone who already had a session, so only genuine first-timers match).
export async function sendFirstSessionFollowups() {
  const admin = createAdminClient();
  const from = new Date(Date.now() - 24 * 3600000).toISOString();
  const to = new Date(Date.now() - 2 * 3600000).toISOString();
  const { data: rows } = await admin
    .from("bookings")
    .select("id, user_id, ends_at, member:profiles!bookings_user_id_fkey(email, full_name, role, first_followup_sent)")
    .eq("status", "bevestigd")
    .gte("ends_at", from)
    .lt("ends_at", to);

  const seen = new Set();
  let sent = 0;
  for (const b of rows || []) {
    if (seen.has(b.user_id)) continue;
    const m = b.member;
    if (!m || m.role !== "lid" || m.first_followup_sent || !m.email) continue;
    seen.add(b.user_id);
    // Claim atomically so overlapping cron runs can't double-send.
    const { data: claimed } = await admin.from("profiles").update({ first_followup_sent: true }).eq("id", b.user_id).eq("first_followup_sent", false).select("id");
    if (!claimed || !claimed.length) continue;
    try {
      const r = await sendFirstSessionFollowup({ to: m.email, name: m.full_name });
      if (r?.ok === false) { await admin.from("profiles").update({ first_followup_sent: false }).eq("id", b.user_id); continue; }
      sent++;
    } catch (e) {
      console.error("first-session followup failed:", b.user_id, e?.message);
      await admin.from("profiles").update({ first_followup_sent: false }).eq("id", b.user_id); // let it retry
    }
  }
  return sent;
}

// Guest → member funnel: non-member buddies who were invited ~1 day ago get one "kom zelf trainen,
// je eerste sessie is gratis" mail (carrying the inviter's ?ref=). Idempotent via email_invites.followup_sent.
export async function sendGuestFollowups() {
  const admin = createAdminClient();
  const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
  const from = new Date(Date.now() - 48 * 3600000).toISOString();
  const to = new Date(Date.now() - 20 * 3600000).toISOString();
  const { data: rows } = await admin
    .from("email_invites")
    .select("id, email, inviter_id, created_at, inviter:profiles!email_invites_inviter_id_fkey(full_name)")
    .eq("followup_sent", false)
    .gte("created_at", from)
    .lt("created_at", to);

  const seenEmail = new Set();
  let sent = 0;
  for (const inv of rows || []) {
    const email = String(inv.email || "").toLowerCase().trim();
    if (!email || seenEmail.has(email)) { await admin.from("email_invites").update({ followup_sent: true }).eq("id", inv.id); continue; }
    seenEmail.add(email);
    // Skip guests who already have an account — they're on the member track, not the guest track.
    const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (existing) { await admin.from("email_invites").update({ followup_sent: true }).eq("id", inv.id); continue; }
    const { data: claimed } = await admin.from("email_invites").update({ followup_sent: true }).eq("id", inv.id).eq("followup_sent", false).select("id");
    if (!claimed || !claimed.length) continue;
    try {
      const signupUrl = `${SITE}/login?mode=signup&ref=${encodeURIComponent(inv.inviter_id)}`;
      const r = await sendGuestFollowup({ to: email, inviterName: inv.inviter?.full_name, signupUrl });
      if (r?.ok === false) { await admin.from("email_invites").update({ followup_sent: false }).eq("id", inv.id); continue; }
      sent++;
    } catch (e) {
      console.error("guest followup failed:", inv.id, e?.message);
      await admin.from("email_invites").update({ followup_sent: false }).eq("id", inv.id);
    }
  }
  return sent;
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
    .select("id, gym_id, user_id, coach_id, starts_at, ends_at, nuki_auth_name, services(name), gym:gyms(access_info, address), member:profiles!bookings_user_id_fkey(email, full_name), coach:profiles!bookings_coach_id_fkey(email, full_name)")
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
  const failures = []; // door-critical mint/config problems, surfaced to the cron so they're never silent
  const healthByGym = new Map(); // lock reachability, checked once per gym per run
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
    let mintFailed = false;
    if (cfg?.enabled) {
      // If the lock is offline, a freshly minted code exists in the cloud but never reaches the physical
      // keypad → the member's code silently doesn't work. Flag it (once per gym) so the owner can act.
      if (!healthByGym.has(b.gym_id)) healthByGym.set(b.gym_id, await getLockHealth(cfg));
      const health = healthByGym.get(b.gym_id);
      if (health?.stale) failures.push(`Nuki-slot lijkt offline${health.lastSeen ? ` (laatst gezien ${new Date(health.lastSeen).toISOString()}, ${health.ageMin} min geleden)` : ""} — een persoonlijke deurcode syncet mogelijk niet naar het keypad; controleer de Bridge/Wi-Fi. Een statische reservecode werkt wél offline.`);
      try {
        code = await ensureBookingKeypadCode(admin, cfg, b);
        personal = true;
      } catch (e) {
        mintFailed = true;
        code = await staticCode(b.gym_id); // fail-safe fallback (a permanent local PIN, works even if Nuki is unreachable)
      }
    }

    // No usable code (personal mint failed AND no static backup configured). Emailing an empty code would
    // strand the member at the door, and access_sent is already claimed so it would never retry. Instead:
    // release the claim so the next 5-min tick tries again, and surface the failure loudly.
    if (!code) {
      await admin.from("bookings").update({ access_sent: false }).eq("id", b.id);
      failures.push(`geen toegangscode voor boeking ${b.id} — Nuki-code mislukte en er is géén statische reservecode ingesteld`);
      continue;
    }
    // Personal mint failed but a static backup saved us — still worth flagging so the owner sees the blip.
    if (mintFailed) failures.push(`Nuki-code minten mislukte voor boeking ${b.id} — statische reservecode verstuurd`);

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
    // Coach-sessie: de COACH staat óók voor die deur. Voorheen ging de code enkel naar de client
    // (bookings.user_id), zodat een coach zonder zijn client niet binnen raakte. Stuur hem dezelfde
    // code — apart, zodat een mislukte mail naar de één de ander niet blokkeert.
    const coachEmail = b.coach_id && b.coach_id !== b.user_id ? b.coach?.email : null;
    if (coachEmail && coachEmail !== b.member?.email) {
      try {
        await sendAccessCode({
          to: coachEmail,
          name: b.coach?.full_name,
          serviceName: `${b.services?.name || "Sessie"} — met ${b.member?.full_name || "je client"}`,
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          accessCode: code,
          personal,
          address,
          mapsUrl,
        });
        sent++;
      } catch (e) { console.error("access code to coach failed:", b.id, e?.message); }
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
      if (b.coach_id && b.coach_id !== b.user_id) {
        await notify({
          gymId: b.gym_id,
          userId: b.coach_id,
          type: "system",
          title: "Toegangscode voor je coach-sessie 🔑",
          body: `Code ${code} · met ${b.member?.full_name || "je client"}`,
          link: "/coach/agenda",
        });
      }
    }
  }
  return { sent, failures };
}

// S5 — abo-suggestie-sweep (dagelijkse activatie-cron): leden met ≥3 zelfbetaalde sessies
// (los mét prijs, of beurtenkaart) in 60 dagen en zonder abo krijgen één visuele mail met hun
// echte besparing. Zelfde regel als de /account-banner. Max 1 mail/60 dagen (email_log-dedupe),
// past_due telt als "heeft al een abo", admin-comp-sessies (los + € 0) tellen niet mee.
export async function sendAboSuggestions() {
  const admin = createAdminClient();
  const since60 = new Date(Date.now() - 60 * 86400000).toISOString();
  const [{ data: leden }, { data: mems }, { data: bks }, { data: logged }] = await Promise.all([
    admin.from("profiles").select("id, email, full_name").eq("role", "lid").not("email", "is", null),
    admin.from("memberships").select("user_id, status").in("status", ["actief", "past_due"]),
    admin.from("bookings").select("user_id, payment_source, price_cents, paid").eq("status", "bevestigd").gte("starts_at", since60),
    admin.from("email_log").select("to_email").eq("kind", "abo_suggestie").gte("created_at", since60),
  ]);
  const hasAbo = new Set((mems || []).map((m) => m.user_id));
  const recent = new Set((logged || []).map((l) => (l.to_email || "").toLowerCase()));
  const stats = {};
  for (const b of bks || []) {
    if (!b.user_id) continue;
    if (b.payment_source === "los" && (b.price_cents || 0) > 0 && b.paid) (stats[b.user_id] ||= { los: 0, credit: 0 }).los++;
    else if (b.payment_source === "credit") (stats[b.user_id] ||= { los: 0, credit: 0 }).credit++;
  }
  let sent = 0;
  for (const m of leden || []) {
    if (sent >= 20) break; // safety cap per run
    const s = stats[m.id];
    if (!s) continue;
    const sessions = s.los + s.credit;
    if (sessions < 3 || hasAbo.has(m.id) || recent.has((m.email || "").toLowerCase())) continue;
    const saving = Math.round(s.los * 3 + s.credit * 1.64 + 24); // €3/losse sessie + €1,64/kaartsessie + 2 gratis maandsessies
    try {
      const r = await sendAboSuggestion({ to: m.email, name: m.full_name, sessions, losCount: s.los, creditCount: s.credit, saving });
      if (r?.ok !== false) sent++;
    } catch (e) {
      console.error("abo suggestion failed:", m.id, e?.message);
    }
  }
  return sent;
}
