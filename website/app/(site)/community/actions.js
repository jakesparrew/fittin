"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe, isStripeConfigured, bizGuest } from "@/lib/stripe";
import { sendEventSignup } from "@/lib/email";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";

export async function redeemReferral(formData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_referral", { p_code: formData.get("code") });
  revalidatePath("/community");
  if (error) return { error: error.message };
  return { ok: true };
}

// Book a spot for an event. Events are ALWAYS paid via Stripe (variable price) — never credits or
// the welcome session. Free (price 0) events are an instant signup.
export async function signupEvent(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/community");
  const { data: profile } = await supabase.from("profiles").select("gym_id, email, full_name").eq("id", user.id).single();
  if (!profile) return { error: "Profiel niet gevonden." };
  const eventId = formData.get("eventId");

  // Only approved, upcoming events with capacity left can be booked.
  const { data: ev } = await supabase.from("events").select("id, title, starts_at, price_cents, capacity, status").eq("id", eventId).maybeSingle();
  if (!ev || ev.status !== "approved") return { error: "Event niet gevonden." };
  if (new Date(ev.starts_at) < new Date()) return { error: "Dit event is al geweest." };

  const { count: taken } = await supabase.from("event_signups").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("paid", true);
  if ((taken ?? 0) >= ev.capacity) return { error: "Dit event is volzet." };

  const { data: existing } = await supabase.from("event_signups").select("id, paid").eq("event_id", eventId).eq("user_id", user.id).maybeSingle();
  if (existing?.paid) return { error: "Je bent al ingeschreven." };

  // Free event → instant signup.
  if (!ev.price_cents) {
    if (!existing) await supabase.from("event_signups").insert({ gym_id: profile.gym_id, event_id: eventId, user_id: user.id, paid: true });
    else await supabase.from("event_signups").update({ paid: true }).eq("id", existing.id);
    if (profile.email) await sendEventSignup({ to: profile.email, name: profile.full_name, title: ev.title, startsAt: ev.starts_at });
    revalidatePath("/community");
    return { ok: true, free: true };
  }

  // Paid event → Stripe Checkout (no credits allowed).
  if (!isStripeConfigured) return { error: "Betalingen nog niet geconfigureerd." };
  const signupId = existing?.id || (await supabase.from("event_signups").insert({ gym_id: profile.gym_id, event_id: eventId, user_id: user.id, paid: false }).select("id").single()).data?.id;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    ...bizGuest,
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: ev.price_cents, product_data: { name: `${ev.title} — Fittin' event` } } }],
    metadata: { kind: "event", event_id: eventId, user_id: user.id, signup_id: signupId || "" },
    success_url: `${siteUrl()}/account?event=1`,
    cancel_url: `${siteUrl()}/community?geannuleerd=1`,
  });
  if (signupId) await supabase.from("event_signups").update({ stripe_session_id: session.id }).eq("id", signupId);
  redirect(session.url);
}

export async function cancelSignup(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("event_signups").delete().eq("id", formData.get("signupId")).eq("user_id", user.id);
  revalidatePath("/community");
}
