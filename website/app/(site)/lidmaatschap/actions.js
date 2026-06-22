"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe, isStripeConfigured, bizCustomer } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/stripe-customer";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";

export async function buyPackage(formData) {
  const packageId = formData.get("packageId");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/lidmaatschap");

  // Coaches buy session credits (€12 each) via their own dashboard — never member packages.
  const { data: meProf } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (meProf?.role === "coach") return { error: "Coaches kopen sessietegoed via hun coach-dashboard, geen ledenpakketten." };

  const { data: pkg } = await supabase.from("packages").select("*").eq("id", packageId).eq("active", true).single();
  if (!pkg) return { error: "Pakket niet gevonden." };
  if (!isStripeConfigured) return { error: "Betalingen nog niet geconfigureerd." };

  const customer = await getOrCreateCustomer(supabase, user.id, user.email);

  if (pkg.kind === "beurtenkaart") {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      ...bizCustomer,
      line_items: [
        {
          quantity: 1,
          price_data: { currency: "eur", unit_amount: pkg.price_cents, product_data: { name: `${pkg.name} — Fittin'` } },
        },
      ],
      metadata: { kind: "punchcard", package_id: pkg.id, credits: String(pkg.credits), user_id: user.id },
      success_url: `${siteUrl()}/account?credits=1`,
      cancel_url: `${siteUrl()}/lidmaatschap?geannuleerd=1`,
    });
    redirect(session.url);
  }

  if (pkg.kind === "abonnement") {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      ...bizCustomer,
      // Inline recurring price from the DB (price_cents) — no pre-created Stripe Price needed,
      // so the abo amount is always whatever the package row says (€12/maand).
      line_items: [{
        quantity: 1,
        price_data: { currency: "eur", unit_amount: pkg.price_cents, recurring: { interval: "month" }, product_data: { name: `${pkg.name} — Fittin'` } },
      }],
      metadata: { kind: "subscription", package_id: pkg.id, user_id: user.id },
      subscription_data: { metadata: { user_id: user.id, package_id: pkg.id, credits: String(pkg.credits) } },
      success_url: `${siteUrl()}/account?abo=1`,
      cancel_url: `${siteUrl()}/lidmaatschap?geannuleerd=1`,
    });
    redirect(session.url);
  }

  return { error: "Onbekend pakket." };
}

// Activate the free FittinWelcome session by putting a card on file (no charge). The card's
// fingerprint is checked in the webhook so the same card can't farm free sessions on many accounts.
export async function activateWelcome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");
  const { data: profile } = await supabase.from("profiles").select("welcome_status, welcome_code_used").eq("id", user.id).single();
  if (!profile || profile.welcome_code_used || profile.welcome_status !== "unclaimed") redirect("/account");
  if (!isStripeConfigured) return { error: "Betalingen nog niet geconfigureerd." };

  const customer = await getOrCreateCustomer(supabase, user.id, user.email);
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer,
    payment_method_types: ["card"],
    metadata: { kind: "welcome", user_id: user.id },
    setup_intent_data: { metadata: { kind: "welcome", user_id: user.id } },
    success_url: `${siteUrl()}/account?welkom=1`,
    cancel_url: `${siteUrl()}/account?welkom=cancel`,
  });
  redirect(session.url);
}

// Open the Stripe billing portal so members can manage/cancel their subscription + cards.
export async function openBillingPortal() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");
  const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!profile?.stripe_customer_id || !isStripeConfigured) redirect("/lidmaatschap");
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${siteUrl()}/account`,
  });
  redirect(session.url);
}
