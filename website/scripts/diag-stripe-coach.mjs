// Read-only: heeft een coach ooit iets via Stripe betaald, ook als de app het niet inboekte?
// De app-tabel `payments` is niet de enige waarheid — een betaling kan in Stripe staan zonder
// dat de webhook ze bij de juiste gebruiker heeft geboekt. Daarom hier rechtstreeks bij de bron.
//   node --env-file=.env.local scripts/diag-stripe-coach.mjs
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const eur = (c, cur = "eur") => (c / 100).toFixed(2) + " " + cur.toUpperCase();

const MENSEN = [
  ["Jan Matthys", "janmatthyss@icloud.com"],
  ["Achilius Batius", "coach@fittin.be"],
  ["Thomas Lesage", "thomas.lesage10@hotmail.com"],
  ["Jean Francois Dujardyn", "jf.dujardyn@gmail.com"],
  ["Jelle Vercruysse", "coachgent.pt@gmail.com"],
];

// Stripe's zoek-API accepteert geen e-mailveld op charges, dus halen we ALLE charges op en
// matchen we lokaal. Een gastbetaling (zonder Stripe-klant) hangt enkel aan receipt_email of
// billing_details.email — precies het geval dat we niet mogen missen bij "heeft hij ooit betaald?".
const alle = [];
for await (const c of stripe.charges.list({ limit: 100 })) alle.push(c);
console.log(`${alle.length} Stripe-betalingen doorzocht (volledige historiek)\n`);

const adresVan = (c) =>
  [c.receipt_email, c.billing_details?.email, c.customer_email].filter(Boolean).map((s) => s.toLowerCase());
const klantCache = new Map();
async function klantMail(id) {
  if (!id) return null;
  if (!klantCache.has(id)) {
    try { const k = await stripe.customers.retrieve(id); klantCache.set(id, k.deleted ? null : (k.email || "").toLowerCase()); }
    catch { klantCache.set(id, null); }
  }
  return klantCache.get(id);
}
for (const c of alle) c._mails = [...adresVan(c), await klantMail(c.customer)].filter(Boolean);

for (const [naam, email] of MENSEN) {
  console.log(`\n${"=".repeat(70)}\n${naam}  <${email}>`);
  const mijn = alle.filter((c) => c._mails.includes(email.toLowerCase()));
  for (const c of mijn) {
    console.log(`     ${new Date(c.created * 1000).toISOString().slice(0, 10)}  ${eur(c.amount, c.currency)}  ${c.paid && c.status === "succeeded" ? "BETAALD" : c.status}  ${c.description || "(geen omschrijving)"}${c.refunded ? "  ⟲ TERUGBETAALD" : ""}`);
    const md = Object.entries(c.metadata || {});
    if (md.length) console.log(`        metadata: ${md.map(([k, v]) => `${k}=${v}`).join(" · ")}`);
  }
  if (!mijn.length) console.log("     ⚠ GEEN ENKELE Stripe-betaling gevonden op dit adres");
}

console.log(`\n${"=".repeat(70)}`);
console.log("Blinde vlek die blijft: cash aan de gym of een overschrijving op de vzw-rekening");
console.log("staat noch in de app, noch in Stripe. Dat kan enkel het rekeninguittreksel bevestigen.");
