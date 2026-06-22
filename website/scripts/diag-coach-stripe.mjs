// Diagnose the coach "Naar de kassa" error: checks the Stripe key mode and whether each coach's
// stored stripe_customer_id resolves in that mode, then reproduces the exact checkout creation.
// Read-only except for a harmless test checkout session (no charge). Run:
//   node --env-file=.env.local scripts/diag-coach-stripe.mjs
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, sk = process.env.STRIPE_SECRET_KEY;
if (!url || !key || !sk) { console.error("Missing env (SUPABASE url/service key or STRIPE_SECRET_KEY)"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const stripe = new Stripe(sk);
const mode = sk.startsWith("sk_live") ? "LIVE" : sk.startsWith("sk_test") ? "TEST" : "?";
console.log(`Stripe key: ${mode}  (${sk.slice(0, 10)}…)\n`);

const { data: coaches } = await sb.from("profiles").select("id, full_name, email, stripe_customer_id").eq("role", "coach");
for (const c of coaches || []) {
  const who = c.full_name || c.email;
  let custStatus = "geen customer id";
  if (c.stripe_customer_id) {
    try { const cu = await stripe.customers.retrieve(c.stripe_customer_id); custStatus = cu.deleted ? "DELETED" : "OK"; }
    catch (e) { custStatus = "ONGELDIG → " + e.message.split("\n")[0]; }
  }
  // Reproduce buyCoachCredits exactly (harmless: creating a session does not charge).
  let checkout = "—";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(c.stripe_customer_id ? { customer: c.stripe_customer_id } : { customer_email: c.email }),
      tax_id_collection: { enabled: true }, billing_address_collection: "auto", customer_update: { name: "auto", address: "auto" },
      line_items: [{ quantity: 10, price_data: { currency: "eur", unit_amount: 1200, product_data: { name: "Coach-sessie — Fittin' (€ 12,00/sessie)" } } }],
      metadata: { kind: "coach_credits", coach_id: c.id, credits: "10" },
      success_url: "https://fittin.be/coach?gekocht=1", cancel_url: "https://fittin.be/coach?geannuleerd=1",
    });
    checkout = "checkout OK (" + (session.url ? "url ✓" : "GEEN url!") + ")";
  } catch (e) { checkout = "CHECKOUT FOUT → " + e.message.split("\n")[0]; }
  console.log(`- ${who}\n    customer: ${c.stripe_customer_id || "-"} → ${custStatus}\n    ${checkout}`);
}
