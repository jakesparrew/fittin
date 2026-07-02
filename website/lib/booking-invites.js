import "server-only";
import { sendSessionInvite, sendEmailInvite, sendBookingCancelled, sendBookingRescheduled } from "@/lib/email";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

// Send the invite e-mails for a CONFIRMED booking. Invitees are persisted at booking
// creation (booking_participants for members, email_invites for non-members), but the
// e-mails only go out once the booking is actually confirmed: immediately for free/credit
// bookings, or from the Stripe webhook after a paid booking's payment succeeds. That way an
// abandoned checkout never e-mails the people who were invited.
//
// `admin` = service-role client. `booking` needs { id, user_id, starts_at, ends_at, services?.name }.
// Best-effort: a mail hiccup must never roll back a confirmed/paid booking, so everything is caught.
export async function sendBookingInvites(admin, booking, fromName) {
  if (!admin || !booking?.id) return;
  const serviceName = booking.services?.name || "Sessie";
  const from = fromName || "Een Fittin'-lid";

  // Members invited to the session (participants, excluding the booker themselves).
  try {
    const { data: parts } = await admin.from("booking_participants").select("user_id").eq("booking_id", booking.id);
    const ids = (parts || []).map((p) => p.user_id).filter((id) => id && id !== booking.user_id);
    if (ids.length) {
      const { data: people } = await admin.from("profiles").select("email, full_name").in("id", ids);
      for (const p of people || []) {
        if (p.email) await sendSessionInvite({ to: p.email, name: p.full_name, fromName: from, serviceName, startsAt: booking.starts_at, endsAt: booking.ends_at });
      }
    }
  } catch (e) {
    console.error("sendBookingInvites (members):", e?.message);
  }

  // Non-members invited by e-mail → signup invite.
  try {
    const { data: invs } = await admin.from("email_invites").select("email").eq("booking_id", booking.id);
    for (const inv of invs || []) {
      if (inv.email) await sendEmailInvite({ to: inv.email, fromName: from, serviceName, startsAt: booking.starts_at, endsAt: booking.ends_at, signupUrl: `${siteUrl()}/login?mode=signup&next=/boeken` });
    }
  } catch (e) {
    console.error("sendBookingInvites (emails):", e?.message);
  }
}

// Tell everyone who was INVITED to a booking that it moved or was cancelled — they were told a
// concrete date/time once, so silence here sends guests to a session that no longer exists.
// kind: "cancelled" | "rescheduled". `booking` needs { id, user_id, starts_at, ends_at?, services?.name }
// with the NEW times for a reschedule. Best-effort like the invites themselves.
export async function notifyInviteesOfChange(admin, booking, kind) {
  if (!admin || !booking?.id) return;
  const serviceName = booking.services?.name || "Sessie";
  const recipients = [];
  try {
    const { data: parts } = await admin.from("booking_participants").select("user_id").eq("booking_id", booking.id);
    const ids = (parts || []).map((p) => p.user_id).filter((id) => id && id !== booking.user_id);
    if (ids.length) {
      const { data: people } = await admin.from("profiles").select("email, full_name").in("id", ids);
      for (const p of people || []) if (p.email) recipients.push({ to: p.email, name: p.full_name });
    }
    const { data: invs } = await admin.from("email_invites").select("email").eq("booking_id", booking.id);
    for (const inv of invs || []) if (inv.email) recipients.push({ to: inv.email, name: null });
  } catch (e) { console.error("notifyInviteesOfChange (lookup):", e?.message); }
  for (const r of recipients) {
    try {
      if (kind === "rescheduled") await sendBookingRescheduled({ to: r.to, name: r.name, serviceName, startsAt: booking.starts_at, endsAt: booking.ends_at });
      else await sendBookingCancelled({ to: r.to, name: r.name, serviceName, startsAt: booking.starts_at });
    } catch (e) { console.error("notifyInviteesOfChange (send):", e?.message); }
  }
}
