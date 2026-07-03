import { notify } from "@/lib/notify";
import { sendWaitlistOpen } from "@/lib/email";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
const MAX_NOTIFY = 3; // notify the earliest few waiters — first to (re)book wins, stays fair

// Convert a timestamptz to the /boeken deep-link params in Europe/Brussels: date "YYYY-MM-DD" + decimal hour.
function brusselsSlotParams(iso) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const d = `${get("year")}-${get("month")}-${get("day")}`;
  const h = Number(get("hour")) + (Number(get("minute")) >= 30 ? 0.5 : 0);
  return { d, h };
}

// A slot just freed (cancel/reschedule) → tell the earliest waiters. Idempotent per waiter via
// notified_at. Best-effort: never throws into the caller (a booking change must not fail on this).
export async function notifyWaitlist(admin, { gymId, slotInstant, serviceName = "Sessie" }) {
  try {
    if (!gymId || !slotInstant) return 0;
    const iso = new Date(slotInstant).toISOString();
    const { data: waiters } = await admin
      .from("slot_waitlist")
      .select("id, user_id, member:profiles!slot_waitlist_user_id_fkey(email, full_name)")
      .eq("gym_id", gymId)
      .eq("slot_instant", iso)
      .is("notified_at", null)
      .order("created_at", { ascending: true })
      .limit(MAX_NOTIFY);
    if (!waiters || !waiters.length) return 0;

    const { d, h } = brusselsSlotParams(iso);
    const bookUrl = `${SITE}/boeken?d=${d}&h=${h}`;
    let notified = 0;
    for (const w of waiters) {
      // Claim atomically so overlapping runs don't double-notify.
      const { data: claimed } = await admin.from("slot_waitlist").update({ notified_at: new Date().toISOString() }).eq("id", w.id).is("notified_at", null).select("id");
      if (!claimed || !claimed.length) continue;
      try {
        await notify({ gymId, userId: w.user_id, type: "system", title: "Er is een plek vrij 🎉", body: "Het uur waarvoor je op de wachtlijst stond is vrijgekomen — boek snel.", link: `/boeken?d=${d}&h=${h}` });
        if (w.member?.email) await sendWaitlistOpen({ to: w.member.email, name: w.member.full_name, serviceName, startsAt: iso, bookUrl });
        notified++;
      } catch (e) { console.error("waitlist notify (one):", e?.message); }
    }
    return notified;
  } catch (e) {
    console.error("notifyWaitlist:", e?.message);
    return 0;
  }
}

// Clear a member's own waitlist entry for a slot once they book it (avoid a stale "plek vrij" ping).
export async function clearWaitlistEntry(admin, { gymId, userId, slotInstant }) {
  try {
    if (!gymId || !userId || !slotInstant) return;
    await admin.from("slot_waitlist").delete().eq("gym_id", gymId).eq("user_id", userId).eq("slot_instant", new Date(slotInstant).toISOString());
  } catch (e) { console.error("clearWaitlistEntry:", e?.message); }
}
