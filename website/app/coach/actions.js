"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, isStripeConfigured, bizCustomer } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/stripe-customer";
import { sendCoachBooked, sendBookingCancelled, sendBookingRescheduled, sendPaymentRequest, sendBuddyInvite, sendWelcomeNewAccount } from "@/lib/email";
import { notify, notifyAdmins } from "@/lib/notify";
import { enrollUserInDrips } from "@/lib/newsletter";
import { logCoachActivity } from "@/lib/coachlog";
import { viewAsActive } from "@/lib/coach";

const cents = (v) => Math.round(parseFloat(String(v || "0").replace(",", ".")) * 100) || 0;

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
const num = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
// Half-hour-aware (6.5 = 06:30) for slot-start / availability fields.
const numF = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

async function requireCoach() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase.from("profiles").select("id, gym_id, role").eq("id", user.id).single();
  if (!profile || !["coach", "beheerder"].includes(profile.role)) return { error: "Geen rechten." };
  if (await viewAsActive()) return { error: "Alleen-lezen tijdens ‘bekijk als coach’. Ga terug naar beheerder om te wijzigen." };
  return { supabase, profile, userId: user.id, email: user.email };
}

// Coach adds a NEW client by e-mail straight from the booking screen: creates the account (or links
// an existing one in this gym), assigns them as this coach's client, and sends the welcome/login mail.
export async function coachCreateClient(formData) {
  const { profile, userId, error } = await requireCoach();
  if (error) return { error };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const full_name = String(formData.get("full_name") || "").trim();
  if (!email || !email.includes("@")) return { error: "Geef een geldig e-mailadres." };

  const admin = createAdminClient();
  let uid;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, email_confirm: true, password: crypto.randomUUID() + "Aa1!", user_metadata: { full_name },
  });
  if (cErr) {
    if (/already|exists|registered/i.test(cErr.message)) {
      const { data: ex } = await admin.from("profiles").select("id, gym_id").eq("email", email).maybeSingle();
      if (!ex) return { error: "Dit e-mailadres bestaat al — vraag de beheerder het lid toe te voegen." };
      if (ex.gym_id !== profile.gym_id) return { error: "Dit lid hoort bij een andere gym." };
      uid = ex.id;
    } else return { error: cErr.message };
  } else {
    uid = created.user.id;
    await admin.from("profiles").update({ gym_id: profile.gym_id, role: "lid", full_name: full_name || null }).eq("id", uid);
    try {
      const { data: link } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${siteUrl()}/wachtwoord-herstellen` } });
      const action = link?.properties?.action_link;
      if (action) await sendWelcomeNewAccount({ to: email, name: full_name, link: action });
    } catch {}
    try { await enrollUserInDrips(uid); } catch {}
  }
  await admin.from("coach_clients").upsert({ gym_id: profile.gym_id, coach_id: userId, client_id: uid }, { onConflict: "gym_id,coach_id,client_id" });
  revalidatePath("/coach");
  revalidatePath("/coach/clienten");
  return { ok: true, clientId: uid };
}

export async function coachBookSession(formData) {
  const { supabase, userId, profile, error } = await requireCoach();
  if (error) return { error };
  const clientId = formData.get("clientId") || null; // null = reserveer enkel het slot (client later toevoegen)
  const { data: bookingId, error: e } = await supabase.rpc("coach_book_session", {
    p_client: clientId,
    p_service: formData.get("serviceId"),
    p_date: formData.get("date"),
    p_hour: numF(formData.get("hour")),
    p_persons: num(formData.get("persons"), 1),
  });
  if (e) return { error: e.message };

  try {
    const { data: booking } = await supabase.from("bookings").select("starts_at, ends_at, services(name)").eq("id", bookingId).single();
    const { data: coach } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    if (clientId) {
      const { data: client } = await supabase.from("profiles").select("email, full_name").eq("id", clientId).single();
      if (booking && client?.email) await sendCoachBooked({ to: client.email, name: client.full_name, coachName: coach?.full_name || "Je coach", serviceName: booking.services?.name || "Sessie", startsAt: booking.starts_at, endsAt: booking.ends_at });
      await notify({ gymId: profile.gym_id, userId: clientId, actorId: userId, type: "coach_booked", title: `${coach?.full_name || "Je coach"} plande een sessie voor je`, body: booking?.services?.name || "Sessie", link: "/account" });
      await logCoachActivity({ gymId: profile.gym_id, coachId: userId, type: "booked", summary: `Sessie geboekt · ${booking?.services?.name || "Sessie"}`, refId: bookingId });
    } else {
      await logCoachActivity({ gymId: profile.gym_id, coachId: userId, type: "booked", summary: `Slot gereserveerd (nog geen client) · ${booking?.services?.name || "Sessie"}`, refId: bookingId });
    }
  } catch {}

  revalidatePath("/coach");
  revalidatePath("/coach/agenda");
  return { ok: true, message: clientId ? "Sessie geboekt ✓" : "Slot gereserveerd ✓ — voeg later een client toe" };
}

// Assign a client to a slot the coach reserved earlier (the booking is currently the coach's own).
export async function coachAssignClient(formData) {
  const { supabase, userId, profile, error } = await requireCoach();
  if (error) return { error };
  const bookingId = formData.get("bookingId");
  const clientId = formData.get("clientId");
  if (!bookingId || !clientId) return { error: "Kies een client." };
  const { data: bk } = await supabase.from("bookings").select("id, user_id, starts_at, ends_at, services(name)").eq("id", bookingId).eq("coach_id", userId).maybeSingle();
  if (!bk) return { error: "Sessie niet gevonden." };
  const { data: link } = await supabase.from("coach_clients").select("id").eq("coach_id", userId).eq("client_id", clientId).eq("status", "accepted").maybeSingle();
  if (!link) return { error: "Dit is niet jouw (verbonden) client." };
  const admin = createAdminClient();
  const { error: e } = await admin.from("bookings").update({ user_id: clientId }).eq("id", bookingId).eq("coach_id", userId);
  if (e) return { error: e.message };
  try {
    const { data: client } = await supabase.from("profiles").select("email, full_name").eq("id", clientId).single();
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    if (client?.email) await sendCoachBooked({ to: client.email, name: client.full_name, coachName: me?.full_name || "Je coach", serviceName: bk.services?.name || "Sessie", startsAt: bk.starts_at, endsAt: bk.ends_at });
    await notify({ gymId: profile.gym_id, userId: clientId, actorId: userId, type: "coach_booked", title: `${me?.full_name || "Je coach"} plande een sessie voor je`, body: bk.services?.name || "Sessie", link: "/account" });
    await logCoachActivity({ gymId: profile.gym_id, coachId: userId, type: "booked", summary: `Client toegevoegd aan gereserveerde sessie · ${bk.services?.name || "Sessie"}`, refId: bookingId });
  } catch {}
  revalidatePath("/coach");
  revalidatePath("/coach/agenda");
  return { ok: true, message: "Client toegevoegd ✓" };
}

// Plan a recurring series of sessions for one client: same weekday + hour, weekly for N weeks.
// Stops early on insufficient credit; skips weeks where the slot is already taken.
export async function coachBulkBook(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const clientId = formData.get("clientId");
  const serviceId = formData.get("serviceId");
  const weekday = num(formData.get("weekday"), 1); // 0=zo..6=za
  const hour = numF(formData.get("hour"), 9);
  const weeks = Math.min(26, Math.max(1, num(formData.get("weeks"), 4)));
  const persons = num(formData.get("persons"), 1);
  if (!clientId || !serviceId) return { error: "Kies een client en een sessie." };

  const fmtDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const diff = (weekday - start.getDay() + 7) % 7;
  start.setDate(start.getDate() + diff);

  let booked = 0; let firstErr = null;
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start.getTime() + i * 7 * 86400000);
    const { error: e } = await supabase.rpc("coach_book_session", { p_client: clientId, p_service: serviceId, p_date: fmtDate(d), p_hour: hour, p_persons: persons });
    if (e) {
      firstErr = e.message;
      if (/Onvoldoende|tegoed|credit/i.test(e.message)) break; // out of credits → stop
      continue; // slot taken / past → skip this week
    }
    booked++;
  }

  try {
    const { data: cl } = await supabase.from("profiles").select("full_name").eq("id", clientId).single();
    await logCoachActivity({ gymId: profile.gym_id, coachId: userId, type: "booked", summary: `Reeks van ${booked} sessies ingepland met ${cl?.full_name || "client"}` });
    if (booked > 0) await notify({ gymId: profile.gym_id, userId: clientId, actorId: userId, type: "coach_booked", title: `Je coach plande ${booked} sessies voor je in`, link: "/account" });
  } catch {}

  revalidatePath("/coach");
  revalidatePath("/coach/agenda");
  if (booked === 0) return { error: firstErr || "Geen sessies ingepland." };
  return { ok: true, message: `${booked} sessies ingepland${firstErr ? " (sommige overgeslagen/onvoldoende tegoed)" : ""} ✓` };
}

export async function cancelCoachBooking(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  // Cancelling is only allowed up to 6 hours before the session.
  const cutoff = new Date(Date.now() + 6 * 3600000).toISOString();
  const { data: cancelled } = await supabase
    .from("bookings")
    .update({ status: "geannuleerd", cancelled_at: new Date().toISOString() })
    .eq("id", formData.get("bookingId"))
    .eq("coach_id", userId)
    .gt("starts_at", cutoff)
    .select("starts_at, user_id, services(name)")
    .maybeSingle();
  if (!cancelled) {
    revalidatePath("/coach"); revalidatePath("/coach/agenda");
    return { error: "Annuleren kan enkel tot 6 uur voor de sessie." };
  }
  // Notify the client their coach cancelled (the credit refund is handled by a DB trigger).
  try {
    const { data: client } = await supabase.from("profiles").select("email, full_name, gym_id").eq("id", cancelled.user_id).single();
    if (client?.email) await sendBookingCancelled({ to: client.email, name: client.full_name, serviceName: cancelled.services?.name || "Sessie", startsAt: cancelled.starts_at });
    if (client) await notify({ gymId: client.gym_id, userId: cancelled.user_id, actorId: userId, type: "coach_booked", title: "Je coach heeft een sessie geannuleerd", body: cancelled.services?.name || "Sessie", link: "/account" });
  } catch {}
  revalidatePath("/coach");
  revalidatePath("/coach/agenda");
  return { ok: true, message: "Sessie geannuleerd ✓" };
}

// Coach moves one of their sessions to a free slot (up to 6h before; the RPC re-checks hours/overlap/blocks).
export async function coachRescheduleBooking(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const bookingId = formData.get("bookingId");
  const { error: e } = await supabase.rpc("reschedule_booking", {
    p_booking: bookingId, p_date: formData.get("date"), p_hour: numF(formData.get("hour")),
  });
  if (e) return { error: e.message };
  try {
    const { data: b } = await supabase.from("bookings").select("starts_at, ends_at, user_id, gym_id, services(name)").eq("id", bookingId).single();
    if (b) {
      const { data: client } = await supabase.from("profiles").select("email, full_name").eq("id", b.user_id).single();
      if (client?.email) await sendBookingRescheduled({ to: client.email, name: client.full_name, serviceName: b.services?.name || "Sessie", startsAt: b.starts_at, endsAt: b.ends_at });
      await notify({ gymId: b.gym_id, userId: b.user_id, actorId: userId, type: "coach_booked", title: "Je coach heeft je sessie verplaatst", body: b.services?.name || "Sessie", link: "/account" });
    }
  } catch {}
  revalidatePath("/coach");
  revalidatePath("/coach/agenda");
  return { ok: true, message: "Sessie verplaatst ✓" };
}

// Free 1h start-times for a date (availability-aware dropdowns). Returns decimals e.g. [6, 6.5, 9, ...].
export async function coachDayAvailability(dateStr) {
  const { supabase, error } = await requireCoach();
  if (error) return { hours: [], ok: false };
  const { data, error: e } = await supabase.rpc("coach_free_hours", { p_date: dateStr });
  if (e) return { hours: [], ok: false };
  return { hours: (data || []).map(Number), ok: true };
}

// Coach requests session-credits from the superadmin (alternative to buying by card).
export async function requestCoachSessions(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const qty = num(formData.get("qty"), 0);
  if (qty < 1) return { error: "Geef een aantal sessies." };
  const { error: e } = await supabase.from("coach_session_requests").insert({
    gym_id: profile.gym_id,
    coach_id: userId,
    qty,
    note: formData.get("note") || null,
  });
  if (e) return { error: e.message };
  await logCoachActivity({ gymId: profile.gym_id, coachId: userId, type: "request", summary: `${qty} coach-sessies aangevraagd` });
  try {
    const { data: c } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    await notifyAdmins({ gymId: profile.gym_id, actorId: userId, type: "request", title: `${c?.full_name || "Een coach"} vraagt ${qty} sessies aan`, body: "Keur goed of wijs af bij Coaches.", link: "/beheer/coaches" });
  } catch {}
  revalidatePath("/coach");
  return { ok: true };
}

// Invite a (future) member by e-mail with the coach's referral code — auto-sends the invite mail.
export async function coachInviteByEmail(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email.includes("@")) return { error: "Vul een geldig e-mailadres in." };
  const { data: me } = await supabase.from("profiles").select("full_name, referral_code").eq("id", userId).single();
  try {
    await sendBuddyInvite({ to: email, fromName: me?.full_name || "Je Fittin'-coach", refCode: me?.referral_code });
  } catch (e) {
    return { error: "Versturen mislukt. Probeer opnieuw." };
  }
  return { ok: true, message: `Uitnodiging verstuurd naar ${email} ✓` };
}

// Upload a real profile photo to Supabase Storage and save the public URL.
export async function uploadCoachPhoto(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const file = formData.get("photo");
  if (!file || typeof file === "string" || !file.size) return { error: "Kies een afbeelding." };
  if (file.size > 5 * 1024 * 1024) return { error: "Afbeelding mag max. 5 MB zijn." };
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) return { error: "Enkel JPG, PNG, WebP of GIF (geen SVG)." };
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `coaches/${userId}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("coach-photos").upload(path, buf, { contentType: file.type, upsert: true });
  if (upErr) return { error: upErr.message };
  const { data: pub } = admin.storage.from("coach-photos").getPublicUrl(path);
  await admin.from("profiles").update({ coach_photo_url: pub.publicUrl }).eq("id", userId);
  revalidateTag("coaches"); // keep the cached public coach list/photo in sync
  revalidatePath("/coach/profiel");
  revalidatePath("/coaches");
  return { ok: true, message: "Foto geüpload ✓" };
}

// Save the coach's public profile (shown on the site at /coaches).
export async function saveCoachProfile(formData) {
  const { userId, error } = await requireCoach();
  if (error) return { error };
  // coach_* columns aren't writable by 'authenticated' (0015 grants) → write via service role
  // after the requireCoach identity check, scoped to the caller's own row.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const eur = (v) => { const s = String(v ?? "").trim(); return s ? cents(s) : null; };
  const name = String(formData.get("full_name") ?? "").trim();
  const { error: e } = await admin
    .from("profiles")
    .update({
      ...(name ? { full_name: name } : {}),
      coach_bio: formData.get("bio") || null,
      coach_specialty: formData.get("specialty") || null,
      coach_pricelist: formData.get("pricelist") || null,
      coach_pt_price_cents: eur(formData.get("pt1_eur")),
      coach_pt2_price_cents: eur(formData.get("pt2_eur")),
      coach_pt3_price_cents: eur(formData.get("pt3_eur")),
      coach_public: formData.get("public") === "on",
      bill_company: formData.get("bill_company") || null,
      bill_vat: formData.get("bill_vat") || null,
      bill_address: formData.get("bill_address") || null,
    })
    .eq("id", userId);
  if (e) return { error: e.message };
  revalidateTag("coaches");
  revalidatePath("/coach/profiel");
  revalidatePath("/coaches");
  return { ok: true, message: "Profiel opgeslagen ✓" };
}

// Set a coach's price for a specific client (overrides the default rate).
export async function setClientPrice(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const clientId = formData.get("clientId");
  const price = cents(formData.get("price_eur"));
  if (price < 1) return { error: "Geef een geldig tarief (€)." };
  // coach_clients writes are beheerder-only at the RLS level; coaches set the price-note via this RPC.
  const { error: e } = await supabase.rpc("set_client_price", { p_client: clientId, p_price: price });
  if (e) return { error: e.message };
  revalidatePath("/coach/clienten");
  return { ok: true, message: "Tarief opgeslagen ✓" };
}

// Coach sends a payment request to a client → the client pays via Stripe from their account.
export async function sendCoachPaymentRequest(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const clientId = formData.get("clientId");
  const amount = cents(formData.get("amount_eur"));
  const sessions = Math.max(0, num(formData.get("sessions"), 0)); // >0 → top up coachee credit on payment
  if (!clientId || amount < 1) return { error: "Kies een client en een bedrag." };
  // Confirm this is the coach's client.
  const { data: link } = await supabase.from("coach_clients").select("id").eq("coach_id", userId).eq("client_id", clientId).eq("status", "accepted").maybeSingle();
  if (!link) return { error: "Dit is niet jouw client." };
  const { error: e } = await supabase.from("coach_payment_requests").insert({
    gym_id: profile.gym_id, coach_id: userId, client_id: clientId, amount_cents: amount, sessions, description: formData.get("description") || null,
  });
  if (e) return { error: e.message };
  try {
    const { data: client } = await supabase.from("profiles").select("email, full_name").eq("id", clientId).single();
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    if (client?.email) await sendPaymentRequest({ to: client.email, name: client.full_name, coachName: me?.full_name || "Je coach", amount, description: formData.get("description") });
    await notify({ gymId: profile.gym_id, userId: clientId, actorId: userId, type: "payment_request", title: `Betaalverzoek van ${me?.full_name || "je coach"}`, body: "€ " + (amount / 100).toFixed(2).replace(".", ",") + (formData.get("description") ? " · " + formData.get("description") : ""), link: "/account" });
    const { data: cl } = await supabase.from("profiles").select("full_name").eq("id", clientId).single();
    await logCoachActivity({ gymId: profile.gym_id, coachId: userId, type: "payment_request", summary: `Betaalverzoek € ${(amount / 100).toFixed(2).replace(".", ",")} naar ${cl?.full_name || "client"}` });
  } catch {}
  revalidatePath("/coach/clienten");
  revalidatePath("/coach/betalingen");
  return { ok: true };
}

export async function cancelCoachPaymentRequest(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  await supabase.from("coach_payment_requests").update({ status: "cancelled" }).eq("id", formData.get("id")).eq("coach_id", userId).eq("status", "pending");
  revalidatePath("/coach/betalingen");
}

// ── Coach ↔ client connection requests ──────────────────────────────────────
// Coach invites a member to connect. The member gets a notification to accept. Until accepted the
// client is "pending" and not bookable. (If the member already requested this coach, this accepts it.)
export async function coachRequestClient(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const clientId = formData.get("clientId");
  if (!clientId) return { error: "Kies een lid." };
  const { error: e } = await supabase.rpc("coach_request_client", { p_client: clientId });
  if (e) return { error: e.message };
  try {
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    await notify({ gymId: profile.gym_id, userId: clientId, actorId: userId, type: "coach_connect", title: `${me?.full_name || "Een coach"} wil je coachen`, body: "Aanvaard de verbinding om samen te starten.", link: "/account" });
  } catch {}
  revalidatePath("/coach/clienten");
  return { ok: true, message: "Uitnodiging verstuurd ✓" };
}

// Accept (accept=1) or decline a pending connection request. Works for either side — the DB RPC
// only lets the party that did NOT send the request respond.
export async function respondCoachLink(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const linkId = formData.get("linkId");
  const accept = formData.get("accept") === "1";
  const { data: link } = await supabase.from("coach_clients").select("coach_id, client_id, requested_by, gym_id").eq("id", linkId).maybeSingle();
  const { error: e } = await supabase.rpc("respond_coach_link", { p_link: linkId, p_accept: accept });
  if (e) return { error: e.message };
  if (accept && link) {
    try {
      const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      const requesterIsCoach = link.requested_by === "coach";
      const requesterId = requesterIsCoach ? link.coach_id : link.client_id;
      await notify({ gymId: link.gym_id, userId: requesterId, actorId: user.id, type: "coach_connect", title: `${me?.full_name || "Iemand"} aanvaardde je verbinding`, body: "Jullie zijn nu verbonden.", link: requesterIsCoach ? "/coach/clienten" : "/account" });
    } catch {}
  }
  revalidatePath("/coach/clienten");
  revalidatePath("/account");
  return { ok: true };
}

// Cancel a pending invite, decline an incoming one, or end an existing connection (either party).
export async function removeCoachLink(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { error: e } = await supabase.rpc("remove_coach_link", { p_link: formData.get("linkId") });
  if (e) return { error: e.message };
  revalidatePath("/coach/clienten");
  revalidatePath("/account");
  return { ok: true };
}

export async function addOwnAvailability(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  await supabase.from("coach_availability").insert({
    gym_id: profile.gym_id,
    coach_id: userId,
    weekday: num(formData.get("weekday"), 1),
    from_hour: numF(formData.get("from_hour"), 9),
    to_hour: numF(formData.get("to_hour"), 18),
  });
  revalidateTag("coaches");
  revalidatePath("/coach/beschikbaarheid");
}

export async function deleteOwnAvailability(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  await supabase.from("coach_availability").delete().eq("id", formData.get("id")).eq("coach_id", userId);
  revalidateTag("coaches");
  revalidatePath("/coach/beschikbaarheid");
}

// Coach buys session-credits (so they don't pay per booking). Stripe one-time → coach_ledger.
export async function buyCoachCredits(formData) {
  const { supabase, userId, email, error } = await requireCoach();
  if (error) return { error };
  if (!isStripeConfigured) return { error: "Betalingen nog niet geconfigureerd." };
  // Coaches always pay a flat € 12 per session — no volume discount, no subscription. They buy
  // 1–100 session-credits up front and spend them when booking client sessions.
  const qty = Math.min(100, Math.max(1, num(formData.get("qty"), 10)));
  const unit = 1200;
  let url;
  try {
    const customer = await getOrCreateCustomer(supabase, userId, email);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      ...bizCustomer,
      line_items: [
        { quantity: qty, price_data: { currency: "eur", unit_amount: unit, product_data: { name: "Coach-sessie — Fittin' (€ 12,00/sessie)" } } },
      ],
      metadata: { kind: "coach_credits", coach_id: userId, credits: String(qty) },
      success_url: `${siteUrl()}/coach?gekocht=1`,
      cancel_url: `${siteUrl()}/coach?geannuleerd=1`,
    });
    url = session.url;
  } catch (e) {
    console.error("buyCoachCredits checkout failed:", e?.message);
    return { error: "Betaling kon niet gestart worden. Probeer het opnieuw of mail info@fittin.be." };
  }
  redirect(url);
}
