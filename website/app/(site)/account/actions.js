"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { stripe, isStripeConfigured, bizGuest } from "@/lib/stripe";
import { sendBookingCancelled, sendSessionInvite, sendInviteSent, sendBuddyJoinAsk } from "@/lib/email";
import { notify, notifyMany } from "@/lib/notify";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";

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

// Cancel one of the caller's own future bookings (free until 24h before per house rules;
// MVP allows cancel up to start time). Flipping status off 'bevestigd' frees the slot.
export async function cancelBookingAction(formData) {
  const id = formData.get("bookingId");
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Cancellation window: members may cancel up to gym.cancel_hours before the start.
  const { data: me } = await supabase.from("profiles").select("email, full_name, gym_id").eq("id", user.id).single();
  const { data: gym } = me?.gym_id ? await supabase.from("gyms").select("cancel_hours").eq("id", me.gym_id).single() : { data: null };
  const cancelHours = gym?.cancel_hours ?? 1;
  const cutoff = new Date(Date.now() + cancelHours * 3600000).toISOString();

  const { data: cancelled } = await supabase
    .from("bookings")
    .update({ status: "geannuleerd", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .gt("starts_at", cutoff)
    .select("starts_at, services(name)")
    .maybeSingle();

  if (!cancelled) {
    return { error: cancelHours > 0 ? `Je kan tot ${cancelHours} uur voor de sessie annuleren.` : "Annuleren niet meer mogelijk." };
  }

  await sendBookingCancelled({ to: me?.email, name: me?.full_name, serviceName: cancelled.services?.name || "Sessie", startsAt: cancelled.starts_at });
  revalidatePath("/account");
  revalidatePath("/boeken");
  return { ok: true };
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
    const { data: added } = await supabase.rpc("add_booking_participants", { p_booking: req.booking_id, p_users: [user.id] });
    if (!added) {
      await supabase.from("booking_join_requests").update({ status: "declined" }).eq("id", id);
      return { error: "Geen plaats meer vrij." };
    }
    await supabase.from("booking_join_requests").update({ status: "accepted" }).eq("id", id);
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    await notify({ gymId: req.gym_id, userId: req.from_user, actorId: user.id, type: "booking_invite", title: `${me?.full_name || "Je buddy"} komt mee trainen! 🎉`, link: "/account" });
  } else {
    await supabase.from("booking_join_requests").update({ status: "declined" }).eq("id", id);
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    await notify({ gymId: req.gym_id, userId: req.from_user, actorId: user.id, type: "booking_invite", title: `${me?.full_name || "Je buddy"} kan niet meekomen`, link: "/account" });
  }
  revalidatePath("/account");
  return { ok: true };
}

// Open the gym door during an active booking. open_door() authorises (active booking only) + logs.
// Physically unlocks via the Nuki Web API when configured; otherwise reports an honest pending
// state instead of a false "opened" (so the UI never lies to the member).
export async function openDoorAction() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_door");
  if (error) return { error: error.message }; // e.g. "Je hebt nu geen actieve boeking."

  const token = process.env.NUKI_API_TOKEN;
  const lock = process.env.NUKI_SMARTLOCK_ID;
  if (!token || !lock) return { pending: true }; // door hardware not connected yet

  try {
    const r = await fetch(`https://api.nuki.io/smartlock/${lock}/action`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: 3 }), // 3 = unlatch (open)
    });
    if (!r.ok) return { error: "De deur reageerde niet. Probeer opnieuw of bel ons even." };
    return { ok: true };
  } catch {
    return { error: "Kon het deursysteem niet bereiken. Probeer opnieuw." };
  }
}
