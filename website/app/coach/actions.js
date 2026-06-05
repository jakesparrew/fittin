"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/stripe-customer";

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
  const { supabase, error } = await requireCoach();
  if (error) return { error };
  const { error: e } = await supabase.rpc("coach_book_session", {
    p_client: formData.get("clientId"),
    p_service: formData.get("serviceId"),
    p_date: formData.get("date"),
    p_hour: num(formData.get("hour")),
    p_persons: num(formData.get("persons"), 1),
  });
  if (e) return { error: e.message };
  revalidatePath("/coach");
  revalidatePath("/coach/agenda");
  return { ok: true };
}

export async function cancelCoachBooking(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  await supabase
    .from("bookings")
    .update({ status: "geannuleerd", cancelled_at: new Date().toISOString() })
    .eq("id", formData.get("bookingId"))
    .eq("coach_id", userId)
    .gt("starts_at", new Date().toISOString());
  revalidatePath("/coach");
  revalidatePath("/coach/agenda");
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
  const unit = me?.coach_session_price_cents || 1000;
  const customer = await getOrCreateCustomer(supabase, userId, email);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer,
    line_items: [
      { quantity: 1, price_data: { currency: "eur", unit_amount: unit * qty, product_data: { name: `${qty} coach-sessies — Fittin'` } } },
    ],
    metadata: { kind: "coach_credits", coach_id: userId, credits: String(qty) },
    success_url: `${siteUrl()}/coach?gekocht=1`,
    cancel_url: `${siteUrl()}/coach?geannuleerd=1`,
  });
  redirect(session.url);
}
