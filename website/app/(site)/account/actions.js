"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { stripe, isStripeConfigured, bizGuest } from "@/lib/stripe";
import { sendBookingRescheduled, sendSessionInvite, sendInviteSent, sendBuddyJoinAsk } from "@/lib/email";
import { notify, notifyMany } from "@/lib/notify";
import { getNukiConfig, openDoorViaNuki } from "@/lib/nuki";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";

// Toggle whether the member appears on the monthly leaderboard (profile setting).
export async function setLeaderboardOptIn(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const optIn = formData.get("opt_in") === "true";
  const { error } = await supabase.from("profiles").update({ leaderboard_opt_in: optIn }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/account");
  return { ok: true, message: optIn ? "Je staat nu op de leaderboard ✓" : "Je staat niet meer op de leaderboard." };
}

// Member pays a coach's payment request via Stripe.
export async function payCoachRequest(formData) {
  const id = formData.get("requestId");
  if (!id || !isStripeConfigured) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");
  const { data: req } = await supabase
    .from("coach_payment_requests")
    .select("id, amount_cents, description, status, client_id, coach:profiles!coach_payment_requests_coach_id_fkey(full_name)")
    .eq("id", id)
    .eq("client_id", user.id)
    .maybeSingle();
  if (!req || req.status !== "pending") return;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    ...bizGuest,
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: req.amount_cents, product_data: { name: `Coaching — ${req.coach?.full_name || "coach"}${req.description ? ` · ${req.description}` : ""}` } } }],
    metadata: { kind: "coach_payment", request_id: req.id, user_id: user.id },
    success_url: `${siteUrl()}/account?betaald=1`,
    cancel_url: `${siteUrl()}/account`,
  });
  await supabase.from("coach_payment_requests").update({ stripe_session_id: session.id }).eq("id", req.id);
  redirect(session.url);
}

// Reschedule one of the caller's own confirmed bookings to a new slot — no refund/cancel, since
// sessions are always paid. Allowed up to 6 hours before the original start; opening hours, overlaps
// and slot blocks are all re-validated atomically inside the reschedule_booking RPC.
export async function rescheduleBookingAction(formData) {
  const id = formData.get("bookingId");
  const date = formData.get("date"); // YYYY-MM-DD
  const hour = parseFloat(formData.get("hour"));
  if (!id || !date || !Number.isFinite(hour)) return { error: "Kies een nieuwe dag en uur." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { error } = await supabase.rpc("reschedule_booking", { p_booking: id, p_date: date, p_hour: hour });
  if (error) return { error: error.message };

  // Confirm the new time by e-mail (best-effort).
  try {
    const { data: me } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).single();
    const { data: b } = await supabase.from("bookings").select("starts_at, ends_at, services(name)").eq("id", id).single();
    if (me?.email && b) await sendBookingRescheduled({ to: me.email, name: me.full_name, serviceName: b.services?.name || "Sessie", startsAt: b.starts_at, endsAt: b.ends_at });
  } catch {}

  revalidatePath("/account");
  revalidatePath("/boeken");
  return { ok: true, message: "Je sessie is verplaatst ✓" };
}

// Invite gym members to come along to one of your own future bookings (capped at the booking's
// person count). Both you and each invited buddy get an email. Buddies only see the session in
// their account once you've paid (handled in the account page query).
export async function inviteBuddiesToBooking(bookingId, userIds) {
  const ids = (Array.isArray(userIds) ? userIds : []).filter(Boolean);
  if (!bookingId || !ids.length) return { error: "Selecteer minstens één lid." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const { data: added, error } = await supabase.rpc("add_booking_participants", { p_booking: bookingId, p_users: ids });
  if (error) return { error: error.message };
  if (!added) return { error: "Geen plaats meer vrij voor deze boeking." };

  try {
    const admin = createAdminClient();
    const [{ data: booking }, { data: people }, { data: me }] = await Promise.all([
      admin.from("bookings").select("starts_at, ends_at, services(name)").eq("id", bookingId).single(),
      admin.from("profiles").select("email, full_name").in("id", ids),
      admin.from("profiles").select("full_name").eq("id", user.id).single(),
    ]);
    const fromName = me?.full_name || user.user_metadata?.full_name || "Een Fittin'-lid";
    for (const p of people || []) {
      if (p.email) await sendSessionInvite({ to: p.email, name: p.full_name, fromName, serviceName: booking?.services?.name || "Sessie", startsAt: booking?.starts_at, endsAt: booking?.ends_at });
    }
    if (user.email) await sendInviteSent({ to: user.email, name: me?.full_name, buddyNames: (people || []).map((p) => p.full_name).filter(Boolean).join(", "), serviceName: booking?.services?.name || "Sessie", startsAt: booking?.starts_at, endsAt: booking?.ends_at });
    const { data: meRow } = await admin.from("profiles").select("gym_id").eq("id", user.id).single();
    if (meRow) await notifyMany(ids, { gymId: meRow.gym_id, actorId: user.id, type: "booking_invite", title: `${me?.full_name || "Een lid"} nodigt je uit voor een sessie`, body: booking?.services?.name || "Sessie", link: "/account" });
  } catch {}

  revalidatePath("/account");
  return { ok: true, added };
}

// Remove someone you invited from your booking.
export async function removeBuddyFromBooking(bookingId, userId) {
  if (!bookingId || !userId) return { error: "Ontbrekende gegevens." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { error } = await supabase.rpc("remove_booking_participant", { p_booking: bookingId, p_user: userId });
  if (error) return { error: error.message };
  revalidatePath("/account");
  return { ok: true };
}

// Ask an accepted buddy to come train with you on one of your bookings ("ik heb geboekt, kom je mee?").
export async function askBuddyToJoin(bookingId, buddyId) {
  if (!bookingId || !buddyId) return { error: "Ontbrekende gegevens." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: me } = await supabase.from("profiles").select("gym_id, full_name").eq("id", user.id).single();
  if (!me) return { error: "Profiel niet gevonden." };

  // Must own the booking, and they must be an accepted buddy.
  const [{ data: booking }, { data: friendship }] = await Promise.all([
    supabase.from("bookings").select("id, user_id, persons, starts_at, ends_at, services(name)").eq("id", bookingId).eq("user_id", user.id).maybeSingle(),
    supabase.from("buddies").select("id").eq("status", "accepted").or(`and(requester_id.eq.${user.id},addressee_id.eq.${buddyId}),and(requester_id.eq.${buddyId},addressee_id.eq.${user.id})`).maybeSingle(),
  ]);
  if (!booking) return { error: "Geen eigen boeking." };
  if (!friendship) return { error: "Jullie zijn geen buddies." };

  const { error } = await supabase.from("booking_join_requests").insert({ gym_id: me.gym_id, booking_id: bookingId, from_user: user.id, to_user: buddyId, status: "pending" });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Je vroeg deze buddy al." : error.message };

  try {
    const admin = createAdminClient();
    const { data: buddy } = await admin.from("profiles").select("email, full_name").eq("id", buddyId).single();
    if (buddy?.email) await sendBuddyJoinAsk({ to: buddy.email, name: buddy.full_name, fromName: me.full_name || "Een buddy", serviceName: booking.services?.name || "Sessie", startsAt: booking.starts_at, endsAt: booking.ends_at });
    await notify({ gymId: me.gym_id, userId: buddyId, actorId: user.id, type: "booking_invite", title: `${me.full_name || "Een buddy"} vraagt of je meekomt trainen`, body: booking.services?.name || "Sessie", link: "/account" });
  } catch {}
  revalidatePath("/account");
  return { ok: true };
}

// Respond to a "come train with me" request (accept → join as participant; decline).
export async function respondJoinRequest(formData) {
  const id = formData.get("id");
  const decision = formData.get("decision");
  if (!id) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: req } = await supabase
    .from("booking_join_requests")
    .select("id, gym_id, booking_id, from_user, to_user, status")
    .eq("id", id)
    .eq("to_user", user.id)
    .maybeSingle();
  if (!req || req.status !== "pending") return;

  if (decision === "accept") {
    // The invitee adds THEMSELVES via a security-definer RPC (the old code called the
    // owner-only add_booking_participants as the invitee, so accept could never succeed).
    const { data: accepted, error: e } = await supabase.rpc("respond_join_request", { p_request: id, p_accept: true });
    if (e) return { error: e.message };
    if (!accepted) return { error: "Geen plaats meer vrij." };
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    await notify({ gymId: req.gym_id, userId: req.from_user, actorId: user.id, type: "booking_invite", title: `${me?.full_name || "Je buddy"} komt mee trainen! 🎉`, link: "/account" });
  } else {
    await supabase.rpc("respond_join_request", { p_request: id, p_accept: false });
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    await notify({ gymId: req.gym_id, userId: req.from_user, actorId: user.id, type: "booking_invite", title: `${me?.full_name || "Je buddy"} kan niet meekomen`, link: "/account" });
  }
  revalidatePath("/account");
  return { ok: true };
}

// Log the member's height (profile) + today's weight (body_metrics, one per day).
export async function logBodyMetrics(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: me } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!me) return { error: "Profiel niet gevonden." };

  const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const height = num(formData.get("height_cm"));
  const goal = num(formData.get("goal_weight_kg"));
  const weight = num(formData.get("weight_kg"));

  if (height != null || goal != null) {
    await supabase.from("profiles").update({ ...(height != null ? { height_cm: Math.round(height) } : {}), ...(goal != null ? { goal_weight_kg: goal } : {}) }).eq("id", user.id);
  }
  if (weight != null && weight > 0) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    const { error } = await supabase.from("body_metrics").upsert({ gym_id: me.gym_id, user_id: user.id, weight_kg: weight, logged_on: today }, { onConflict: "user_id,logged_on" });
    if (error) return { error: error.message };
  }
  revalidatePath("/account");
  return { ok: true, message: "Opgeslagen ✓" };
}

// Open the gym door during an active booking. open_door() authorises (active booking only) + logs.
// Physically unlocks via the Nuki Web API when configured; otherwise reports an honest pending
// state instead of a false "opened" (so the UI never lies to the member).
export async function openDoorAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { error } = await supabase.rpc("open_door");
  if (error) return { error: error.message }; // e.g. "Je hebt nu geen actieve boeking."

  // Same Nuki config as the per-booking keypad codes (gym_integrations first, env fallback).
  const admin = createAdminClient();
  let gymId = null;
  try { const { data: p } = await admin.from("profiles").select("gym_id").eq("id", user.id).single(); gymId = p?.gym_id; } catch {}
  const cfg = await getNukiConfig(admin, gymId);
  if (!cfg.hasToken || !cfg.hasLock) return { pending: true }; // door hardware not connected yet

  try {
    const r = await openDoorViaNuki(cfg);
    if (!r.ok) return { error: "De deur reageerde niet. Probeer opnieuw of bel ons even." };
    return { ok: true };
  } catch {
    return { error: "Kon het deursysteem niet bereiken. Probeer opnieuw." };
  }
}
