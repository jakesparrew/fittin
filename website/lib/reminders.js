import { createAdminClient } from "@/lib/supabase/admin";
import { sendSessionReminder, sendAccessCode } from "@/lib/email";

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
    if (b.member?.email) {
      try {
        await sendSessionReminder({
          to: b.member.email,
          name: b.member.full_name,
          serviceName: b.services?.name || "Sessie",
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          coachName: b.coach?.full_name,
        });
        sent++;
      } catch {}
    }
    await admin.from("bookings").update({ reminder_sent: true }).eq("id", b.id);
  }
  return sent;
}

// Access codes: ~5 minutes before a confirmed session starts, e-mail the entry code + directions.
// access_sent guards against repeats; the window is a few minutes wide so a 5-min cron never misses one.
export async function sendDueAccessCodes() {
  const admin = createAdminClient();
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 6 * 60000).toISOString(); // sessions starting within ~6 minutes
  const { data: rows } = await admin
    .from("bookings")
    .select("id, starts_at, ends_at, services(name), gym:gyms(access_code, access_info, address), member:profiles!bookings_user_id_fkey(email, full_name)")
    .eq("status", "bevestigd")
    .eq("access_sent", false)
    .gte("starts_at", from)
    .lt("starts_at", to);

  let sent = 0;
  for (const b of rows || []) {
    if (b.member?.email) {
      try {
        const address = b.gym?.address || "Aannemersstraat 186, 9040 Gent";
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
        await sendAccessCode({
          to: b.member.email,
          name: b.member.full_name,
          serviceName: b.services?.name || "Sessie",
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          accessCode: b.gym?.access_code || null,
          address,
          mapsUrl,
        });
        sent++;
      } catch {}
    }
    await admin.from("bookings").update({ access_sent: true }).eq("id", b.id);
  }
  return sent;
}
