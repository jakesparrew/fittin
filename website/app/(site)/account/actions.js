"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { stripe, isStripeConfigured, bizGuest, invoiceForBusiness } from "@/lib/stripe";
import { sendBookingRescheduled, sendSessionInvite, sendInviteSent, sendBuddyJoinAsk } from "@/lib/email";
import { notify, notifyMany } from "@/lib/notify";
import { getNukiConfig, openDoorViaNuki } from "@/lib/nuki";
import { recordConsent, hasConsent, PRIVACY_VERSION } from "@/lib/legal";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

// Toggle whether the member appears on the monthly leaderboard (profile setting).
// A member/client saves billing details so they can download an invoice on their company name (B2B).
// bill_* are protected columns → service role after the identity check, scoped to the own row.
export async function saveBillingDetails(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { error } = await createAdminClient().from("profiles").update({
    bill_company: formData.get("bill_company") || null,
    bill_vat: formData.get("bill_vat") || null,
    bill_address: formData.get("bill_address") || null,
  }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/account/betalingen");
  return { ok: true, message: "Facturatiegegevens opgeslagen ✓" };
}

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

// Member asks a coach to coach them. The coach gets a notification to accept. (If that coach already
// invited this member, this accepts it.) Once accepted, the coach can book sessions with them.
export async function clientRequestCoach(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const coachId = formData.get("coachId");
  if (!coachId) return { error: "Kies een coach." };
  const { error } = await supabase.rpc("client_request_coach", { p_coach: coachId });
  if (error) return { error: error.message };
  try {
    const { data: me } = await supabase.from("profiles").select("full_name, gym_id").eq("id", user.id).single();
    await notify({ gymId: me?.gym_id, userId: coachId, actorId: user.id, type: "coach_connect", title: `${me?.full_name || "Een lid"} wil met jou verbinden`, body: "Aanvaard de verbinding om hen te coachen.", link: "/coach/clienten" });
  } catch {}
  revalidatePath("/account");
  revalidatePath(`/coaches/${coachId}`);
  return { ok: true, message: "Aanvraag verstuurd ✓" };
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
    ...invoiceForBusiness,
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: req.amount_cents, product_data: { name: `Coaching — ${req.coach?.full_name || "coach"}${req.description ? ` · ${req.description}` : ""}` } } }],
    metadata: { kind: "coach_payment", request_id: req.id, user_id: user.id },
    success_url: `${siteUrl()}/account?betaald=1`,
    cancel_url: `${siteUrl()}/account?betaling=afgebroken`,
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

  // Capture the OLD slot before moving, so we can offer it to the waitlist once it frees.
  const { data: before } = await supabase.from("bookings").select("gym_id, starts_at, services(name)").eq("id", id).single();

  const { error } = await supabase.rpc("reschedule_booking", { p_booking: id, p_date: date, p_hour: hour });
  if (error) return { error: error.message };

  // The original slot is now free → tell the earliest waiters (best-effort, never blocks the move).
  if (before?.gym_id && before?.starts_at) {
    try {
      const { notifyWaitlist } = await import("@/lib/waitlist");
      await notifyWaitlist(createAdminClient(), { gymId: before.gym_id, slotInstant: before.starts_at, serviceName: before.services?.name || "Sessie" });
    } catch {}
  }

  // Confirm the new time by e-mail (best-effort) — and tell invited buddies/guests, who were
  // told the OLD time.
  try {
    const { data: me } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).single();
    const { data: b } = await supabase.from("bookings").select("starts_at, ends_at, services(name)").eq("id", id).single();
    if (me?.email && b) await sendBookingRescheduled({ to: me.email, name: me.full_name, serviceName: b.services?.name || "Sessie", startsAt: b.starts_at, endsAt: b.ends_at });
    if (b) {
      const { notifyInviteesOfChange } = await import("@/lib/booking-invites");
      await notifyInviteesOfChange(createAdminClient(), { id, user_id: user.id, ...b }, "rescheduled");
    }
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
      admin.from("bookings").select("starts_at, ends_at, paid, price_cents, services(name)").eq("id", bookingId).single(),
      admin.from("profiles").select("email, full_name").in("id", ids),
      admin.from("profiles").select("full_name").eq("id", user.id).single(),
    ]);
    const fromName = me?.full_name || user.user_metadata?.full_name || "Een Fittin'-lid";
    // Only e-mail the invitee once the booking is CONFIRMED (paid or free). For an unpaid booking
    // (pending Stripe) the participant is already added above — the invite e-mail is sent by the
    // payment webhook (sendBookingInvites), so an abandoned checkout never e-mails them, and a buddy
    // added before payment isn't e-mailed twice.
    const confirmed = !!booking && (booking.paid || booking.price_cents === 0);
    if (confirmed) {
      for (const p of people || []) {
        if (p.email) await sendSessionInvite({ to: p.email, name: p.full_name, fromName, serviceName: booking?.services?.name || "Sessie", startsAt: booking?.starts_at, endsAt: booking?.ends_at });
      }
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

  // Gewicht, lengte en streefgewicht zijn gezondheidsgegevens (art. 9 AVG). Die mogen enkel op
  // basis van UITDRUKKELIJKE toestemming — "je vult het zelf in" volstaat niet als grondslag, en
  // de AVG vraagt bovendien dat je die toestemming kan aantonen (art. 7.1). Daarom: de eerste keer
  // moet het vinkje mee, en leggen we de toestemming vast. Daarna niet meer vragen.
  const admin = createAdminClient();
  const alreadyConsented = await hasConsent(admin, user.id, "gezondheidsdata");
  if (!alreadyConsented) {
    if (formData.get("acceptHealth") !== "on") {
      return { error: "Vink eerst aan dat we je gewicht en lichaamsgegevens mogen bijhouden." };
    }
    await recordConsent({ gymId: me.gym_id, userId: user.id, kind: "gezondheidsdata", context: "lichaamsmetingen", docVersion: PRIVACY_VERSION });
  }

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

// A member deliberately reports a problem ("de deur ging niet open", "betalen lukte niet").
// Lands in problem_reports (0113) + rings every beheerder's bell → /beheer/meldingen.
export async function reportProblem(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const message = String(formData.get("message") || "").trim().slice(0, 2000);
  if (message.length < 5) return { error: "Beschrijf kort wat er misliep." };
  const page = String(formData.get("page") || "").slice(0, 300) || null;
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("gym_id, full_name").eq("id", user.id).single();
  if (!p?.gym_id) return { error: "Geen gym gevonden bij je account." };
  const { error: e } = await admin.from("problem_reports").insert({ gym_id: p.gym_id, user_id: user.id, message, page });
  if (e) return { error: e.message };
  try {
    const { data: admins } = await admin.from("profiles").select("id").eq("gym_id", p.gym_id).eq("role", "beheerder");
    for (const a of admins || []) {
      await notify({ gymId: p.gym_id, userId: a.id, actorId: user.id, type: "system", title: `🛟 Probleemmelding van ${p.full_name || "een lid"}`, body: message.slice(0, 80), link: "/beheer/meldingen" });
    }
  } catch {}
  return { ok: true, message: "Bedankt voor je melding — we bekijken het zo snel mogelijk! 🙏" };
}

// ---- Rechten van betrokkenen (AVG) ------------------------------------------------------------

// Recht op verwijdering (art. 17). We wissen hier NIETS zelf: dit is een productiedatabase met
// boekhoudkundige bewaarplicht en met boekingen waar andere leden aan hangen. De aanvraag wordt
// geregistreerd en bij de beheerder gemeld, die ze uitvoert binnen de wettelijke maand. Zo blijft
// verwijderen een bewuste, controleerbare handeling in plaats van een onomkeerbare klik.
export async function requestAccountDeletion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("gym_id, full_name, deletion_requested_at").eq("id", user.id).single();
  if (me?.deletion_requested_at) {
    return { ok: true, message: "Je aanvraag liep al — we behandelen ze binnen 30 dagen." };
  }

  const { error } = await admin.from("profiles").update({ deletion_requested_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return { error: error.message };

  // De beheerders moeten dit zien: de AVG-termijn loopt vanaf nu.
  try {
    const { data: admins } = await admin.from("profiles").select("id").eq("gym_id", me?.gym_id).eq("role", "beheerder");
    for (const a of admins || []) {
      await notify({
        gymId: me?.gym_id, userId: a.id, type: "system",
        title: "Verzoek tot verwijdering van gegevens",
        body: `${me?.full_name || user.email} vroeg zijn account te verwijderen. Te behandelen binnen 30 dagen (AVG art. 17).`,
        link: "/beheer/leden",
      });
    }
  } catch {}

  revalidatePath("/account");
  return { ok: true, message: "Je aanvraag is geregistreerd. We behandelen ze binnen 30 dagen en bevestigen per e-mail." };
}

// Een aanvraag moet je ook weer kunnen intrekken — bedenken mag.
export async function cancelAccountDeletion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { error } = await createAdminClient().from("profiles").update({ deletion_requested_at: null }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/account");
  return { ok: true, message: "Je aanvraag is ingetrokken — je account blijft gewoon bestaan." };
}

// Toestemming voor gezondheidsgegevens intrekken (art. 7.3 AVG) en de gegevens meteen wissen.
// Dit mag WEL onmiddellijk: het gaat uitsluitend om gegevens die het lid zelf heeft ingevuld, er
// hangt geen boekhouding of andere persoon aan, en de AVG vraagt dat intrekken even eenvoudig is
// als geven. Het streefgewicht en de lengte op het profiel gaan mee.
export async function withdrawHealthConsent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };

  const admin = createAdminClient();
  const { error } = await admin.from("body_metrics").delete().eq("user_id", user.id);
  if (error) return { error: error.message };
  await admin.from("profiles").update({ height_cm: null, goal_weight_kg: null }).eq("id", user.id);
  await admin.from("legal_consents")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("user_id", user.id).eq("kind", "gezondheidsdata").is("withdrawn_at", null);

  revalidatePath("/account");
  return { ok: true, message: "Je gewichts- en lichaamsgegevens zijn gewist." };
}
