// One-off: fill payments.receipt_url for existing payments that were created before the webhook
// started capturing it. Retrieves each payment's Stripe receipt (checkout session → payment_intent
// → latest_charge.receipt_url) or invoice (hosted_invoice_url). Read-only on Stripe; only writes the
// receipt_url column. Run with the LIVE env:
//   vercel env pull /tmp/vc.env --environment=production --yes
//   node --env-file=/tmp/vc.env scripts/backfill-receipts.mjs   (then delete /tmp/vc.env)
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, sk = process.env.STRIPE_SECRET_KEY;
if (!url || !key || !sk) { console.error("Missing env (SUPABASE url/service key or STRIPE_SECRET_KEY)"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const stripe = new Stripe(sk);
console.log(`Stripe key: ${sk.startsWith("sk_live") ? "LIVE" : sk.startsWith("sk_test") ? "TEST" : "?"}`);

const { data: rows, error } = await sb
  .from("payments")
  .select("id, kind, amount_cents, stripe_id, receipt_url")
  .is("receipt_url", null)
  .not("stripe_id", "is", null);
if (error) { console.error("Query failed:", error.message); process.exit(1); }
console.log(`${rows.length} betaling(en) zonder betaalbewijs.`);

let filled = 0;
for (const p of rows) {
  let receipt = null;
  try {
    if (p.stripe_id.startsWith("cs_")) {
      const s = await stripe.checkout.sessions.retrieve(p.stripe_id, { expand: ["payment_intent.latest_charge"] });
      receipt = s?.payment_intent?.latest_charge?.receipt_url || null;
    } else if (p.stripe_id.startsWith("in_")) {
      const inv = await stripe.invoices.retrieve(p.stripe_id);
      receipt = inv?.hosted_invoice_url || null;
    } else if (p.stripe_id.startsWith("pi_")) {
      const pi = await stripe.paymentIntents.retrieve(p.stripe_id, { expand: ["latest_charge"] });
      receipt = pi?.latest_charge?.receipt_url || null;
    }
  } catch (e) { console.log(`  ✗ ${p.kind} ${p.stripe_id.slice(0, 12)}… → ${e.message.split("\n")[0]}`); continue; }
  if (receipt) {
    const { error: e2 } = await sb.from("payments").update({ receipt_url: receipt }).eq("id", p.id);
    if (e2) { console.log(`  ✗ update faalde: ${e2.message}`); continue; }
    filled++;
    console.log(`  ✓ ${p.kind} · €${(p.amount_cents / 100).toFixed(2)} → bewijs ingevuld`);
  } else {
    console.log(`  – ${p.kind} ${p.stripe_id.slice(0, 12)}… → geen receipt beschikbaar`);
  }
}
console.log(`\nKlaar: ${filled}/${rows.length} bijgewerkt.`);
