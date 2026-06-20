// One-time Stripe setup: webhook endpoint (→ signing secret) + subscription product/price.
// Usage: node --env-file=.env.local scripts/stripe-setup.mjs
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be") + "/api/stripe/webhook";
const EVENTS = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
];

// --- Webhook endpoint: recreate to capture a fresh signing secret ---
const existing = await stripe.webhookEndpoints.list({ limit: 100 });
for (const ep0 of existing.data.filter((e) => e.url === WEBHOOK_URL)) {
  await stripe.webhookEndpoints.del(ep0.id);
}
let ep;
for (let i = 0; i < 8; i++) {
  try {
    ep = await stripe.webhookEndpoints.create({ url: WEBHOOK_URL, enabled_events: EVENTS });
    break;
  } catch (e) {
    if (i === 7) throw e;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
console.log("STRIPE_WEBHOOK_SECRET=" + ep.secret);

// --- Subscription product + monthly price (€12) — informatief; de app rekent met inline price_data ---
const products = await stripe.products.list({ limit: 100 });
let product = products.data.find((p) => p.metadata?.fittin === "member-sub");
if (!product) {
  product = await stripe.products.create({ name: "Fittin' Member", metadata: { fittin: "member-sub" } });
}
const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
let price = prices.data.find((p) => p.recurring?.interval === "month" && p.unit_amount === 1200);
if (!price) {
  price = await stripe.prices.create({
    product: product.id,
    unit_amount: 1200,
    currency: "eur",
    recurring: { interval: "month" },
  });
}
console.log("SUBSCRIPTION_PRICE_ID=" + price.id);

// --- Customer portal config (so members can manage their subscription) ---
try {
  const cfgs = await stripe.billingPortal.configurations.list({ limit: 100 });
  if (!cfgs.data.length) {
    await stripe.billingPortal.configurations.create({
      business_profile: { headline: "Fittin' — beheer je abonnement" },
      features: {
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
      },
    });
    console.log("PORTAL=created default config");
  } else {
    console.log("PORTAL=exists");
  }
} catch (e) {
  console.log("PORTAL=skip (" + e.message + ")");
}

console.log("✓ stripe setup complete");
