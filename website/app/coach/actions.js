"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe, isStripeConfigured, bizCustomer } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/stripe-customer";
import { sendCoachBooked, sendBookingCancelled, sendPaymentRequest } from "@/lib/email";
import { notify } from "@/lib/notify";
import { logCoachActivity } from "@/lib/coachlog";

const cents = (v) => Math.round(parseFloat(String(v || "0").replace(",", ".")) * 100) || 0;

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";
const num = (v, d = 0) => {
  const n = parseInt(v, 10);
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
  return { supabase, profile, userId: user.id, email: user.email };
}

export async function coachBookSession(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const { data: bookingId, error: e } = await supabase.rpc("coach_book_session", {
    p_client: formData.get("clientId"),
    p_service: formData.get("serviceId"),
    p_date: formData.get("date"),
    p_hour: num(formData.get("hour")),
    p_persons: num(formData.get("persons"), 1),
  });
  if (e) return { error: e.message };

  // Notify the client their coach booked a session for them.
  try {
    const [{ data: booking }, { data: client }, { data: coach }] = await Promise.all([
      supabase.from("bookings").select("starts_at, ends_at, services(name)").eq("id", bookingId).single(),
      supabase.from("profiles").select("email, full_name").eq("id", formData.get("clientId")).single(),
      supabase.from("profiles").select("full_name").eq("id", userId).single(),
    ]);
    if (booking && client?.email)
      await sendCoachBooked({
        to: client.email,
        name: client.full_name,
        coachName: coach?.full_name || "Je coach",
        serviceName: booking.services?.name || "Sessie",
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
      });
    const { data: prof } = await supabase.from("profiles").select("gym_id").eq("id", userId).single();
    if (prof) {
      await notify({ gymId: prof.gym_id, userId: formData.get("clientId"), actorId: userId, type: "coach_booked", title: `${coach?.full_name || "Je coach"} plande een sessie voor je`, body: booking?.services?.name || "Sessie", link: "/account" });
      await logCoachActivity({ gymId: prof.gym_id, coachId: userId, type: "booked", summary: `Sessie geboekt met ${client?.full_name || "client"} · ${booking?.services?.name || "Sessie"}`, refId: bookingId });
    }
  } catch {}

  revalidatePath("/coach");
  revalidatePath("/coach/agenda");
  return { ok: true };
}

export async function cancelCoachBooking(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const { data: cancelled } = await supabase
    .from("bookings")
    .update({ status: "geannuleerd", cancelled_at: new Date().toISOString() })
    .eq("id", formData.get("bookingId"))
    .eq("coach_id", userId)
    .gt("starts_at", new Date().toISOString())
    .select("starts_at, user_id, services(name)")
    .maybeSingle();
  // Notify the client their coach cancelled (the credit refund is handled by a DB trigger).
  if (cancelled) {
    try {
      const { data: client } = await supabase.from("profiles").select("email, full_name").eq("id", cancelled.user_id).single();
      if (client?.email) await sendBookingCancelled({ to: client.email, name: client.full_name, serviceName: cancelled.services?.name || "Sessie", startsAt: cancelled.starts_at });
    } catch {}
  }
  revalidatePath("/coach");
  revalidatePath("/coach/agenda");
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
  revalidatePath("/coach");
  return { ok: true };
}

// Upload a real profile photo to Supabase Storage and save the public URL.
export async function uploadCoachPhoto(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const file = formData.get("photo");
  if (!file || typeof file === "string" || !file.size) return { error: "Kies een afbeelding." };
  if (file.size > 4 * 1024 * 1024) return { error: "Afbeelding mag max. 4 MB zijn." };
  if (!/^image\//.test(file.type)) return { error: "Alleen afbeeldingen." };
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `coaches/${userId}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("coach-photos").upload(path, buf, { contentType: file.type, upsert: true });
  if (upErr) return { error: upErr.message };
  const { data: pub } = admin.storage.from("coach-photos").getPublicUrl(path);
  await supabase.from("profiles").update({ coach_photo_url: pub.publicUrl }).eq("id", userId);
  revalidatePath("/coach/profiel");
  revalidatePath("/coaches");
  return { ok: true, message: "Foto geüpload ✓" };
}

// Save the coach's public profile (shown on the site at /coaches).
export async function saveCoachProfile(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const { error: e } = await supabase
    .from("profiles")
    .update({
      coach_bio: formData.get("bio") || null,
      coach_specialty: formData.get("specialty") || null,
      coach_photo_url: formData.get("photo_url") || null,
      coach_pricelist: formData.get("pricelist") || null,
      coach_public: formData.get("public") === "on",
    })
    .eq("id", userId);
  if (e) return { error: e.message };
  revalidatePath("/coach/profiel");
  revalidatePath("/coaches");
  return { ok: true, message: "Profiel opgeslagen ✓" };
}

// Set a coach's price for a specific client (overrides the default rate).
export async function setClientPrice(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const clientId = formData.get("clientId");
  const { error: e } = await supabase
    .from("coach_clients")
    .update({ price_cents: cents(formData.get("price_eur")) })
    .eq("coach_id", userId)
    .eq("client_id", clientId);
  if (e) return { error: e.message };
  revalidatePath("/coach/clienten");
  return { ok: true };
}

// Coach sends a payment request to a client → the client pays via Stripe from their account.
export async function sendCoachPaymentRequest(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const clientId = formData.get("clientId");
  const amount = cents(formData.get("amount_eur"));
  if (!clientId || amount < 1) return { error: "Kies een client en een bedrag." };
  // Confirm this is the coach's client.
  const { data: link } = await supabase.from("coach_clients").select("id").eq("coach_id", userId).eq("client_id", clientId).maybeSingle();
  if (!link) return { error: "Dit is niet jouw client." };
  const { error: e } = await supabase.from("coach_payment_requests").insert({
    gym_id: profile.gym_id, coach_id: userId, client_id: clientId, amount_cents: amount, description: formData.get("description") || null,
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

export async function addOwnAvailability(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  await supabase.from("coach_availability").insert({
    gym_id: profile.gym_id,
    coach_id: userId,
    weekday: num(formData.get("weekday"), 1),
    from_hour: num(formData.get("from_hour"), 9),
    to_hour: num(formData.get("to_hour"), 18),
  });
  revalidatePath("/coach/beschikbaarheid");
}

export async function deleteOwnAvailability(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  await supabase.from("coach_availability").delete().eq("id", formData.get("id")).eq("coach_id", userId);
  revalidatePath("/coach/beschikbaarheid");
}

// Coach buys session-credits (so they don't pay per booking). Stripe one-time → coach_ledger.
export async function buyCoachCredits(formData) {
  const { supabase, userId, email, error } = await requireCoach();
  if (error) return { error };
  if (!isStripeConfigured) return { error: "Betalingen nog niet geconfigureerd." };
  const qty = num(formData.get("qty"), 10);
  const { data: me } = await supabase.from("profiles").select("coach_session_price_cents").eq("id", userId).single();
  // Coaches pay a flat rate per session (default € 15) — no bulk/volume discount, no subscription.
  const unit = me?.coach_session_price_cents || 1500;
  const customer = await getOrCreateCustomer(supabase, userId, email);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer,
    ...bizCustomer,
    line_items: [
      { quantity: qty, price_data: { currency: "eur", unit_amount: unit, product_data: { name: `Coach-sessie — Fittin' (€ ${(unit / 100).toFixed(2)}/sessie)` } } },
    ],
    metadata: { kind: "coach_credits", coach_id: userId, credits: String(qty) },
    success_url: `${siteUrl()}/coach?gekocht=1`,
    cancel_url: `${siteUrl()}/coach?geannuleerd=1`,
  });
  redirect(session.url);
}
