"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, isStripeConfigured, bizGuest } from "@/lib/stripe";
import { sendEventSignup } from "@/lib/email";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

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

  // Free event → instant signup, via join_free_event. Die functie doet bestaan, capaciteit en
  // inschrijving in één transactie: de losse controles hierboven konden elkaar kruisen waardoor
  // twee mensen tegelijk de laatste plaats namen. Ze is ook de enige weg die nog overblijft —
  // rechtstreeks in event_signups schrijven is ingetrokken (migratie 0132), want daarmee kon een
  // lid zichzelf op een BETALEND event zetten met paid=true.
  if (!ev.price_cents) {
    const { error: joinErr } = await supabase.rpc("join_free_event", { p_event: eventId });
    if (joinErr) return { error: joinErr.message };
    if (profile.email) await sendEventSignup({ to: profile.email, name: profile.full_name, title: ev.title, startsAt: ev.starts_at });
    revalidatePath("/community");
    return { ok: true, free: true };
  }

  // Paid event → Stripe Checkout (no credits allowed). Reserve the seat atomically first so
  // concurrent checkouts can't oversell the event (counts paid + fresh holds, ≤30 min).
  if (!isStripeConfigured) return { error: "Betalingen nog niet geconfigureerd." };
  const { data: signupId, error: reserveErr } = await supabase.rpc("reserve_event_seat", { p_event: eventId });
  if (reserveErr) return { error: reserveErr.message };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    ...bizGuest,
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: ev.price_cents, product_data: { name: `${ev.title} — Fittin' event` } } }],
    metadata: { kind: "event", event_id: eventId, user_id: user.id, signup_id: signupId || "" },
    success_url: `${siteUrl()}/account?event=1`,
    cancel_url: `${siteUrl()}/account?betaling=afgebroken`,
  });
  // Het sessie-id op de gereserveerde plaats zetten moet met de service-rol: migratie 0132 trok
  // UPDATE op event_signups in voor `authenticated`, dus met de gebruikersclient gaf dit 42501 —
  // stil, want de teruggave werd weggegooid. Mislukt het alsnog, dan is dat niet fataal (de
  // webhook schrijft het id later toch weg), maar het hoort wel in de logs te staan.
  if (signupId) {
    const admin = createAdminClient();
    const { error: linkErr } = await admin.from("event_signups").update({ stripe_session_id: session.id }).eq("id", signupId);
    if (linkErr) console.error("event_signups koppelen aan Stripe-sessie mislukt:", signupId, linkErr.message);
  }
  redirect(session.url);
}

// Uitschrijven mag een lid alleen zelf voor een GRATIS event dat nog niet betaald is — zie de
// policy event_signups_delete (0142). Een betaalde inschrijving wissen zou de plaats vrijgeven
// terwijl de betaling blijft staan; dat hoort via het beheer te lopen zodat er terugbetaald wordt.
// Zonder deze controle raakte de delete stil 0 rijen en bleef de knop "werken" zonder effect.
export async function cancelSignup(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data, error } = await supabase
    .from("event_signups")
    .delete()
    .eq("id", formData.get("signupId"))
    .eq("user_id", user.id)
    .select("id");
  revalidatePath("/community");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Je bent al betaald ingeschreven — mail info@fittin.be om je plaats vrij te geven." };
  return { ok: true };
}
