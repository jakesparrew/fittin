// Read-only: waar zit de schuld van een coach precies, en is er ooit iets betaald?
// Twee mechanismen die door elkaar lopen:
//   • tegoed-coach  → schuld = NEGATIEF saldo in coach_ledger
//   • factuur-coach → schuld = coach_charge_cents op BOEKINGEN die nog niet gefactureerd zijn
// Daarom staat de ene "in de min" en de andere niet, terwijl beiden geld verschuldigd zijn.
//   node --env-file=.env.local scripts/diag-coach-schuld.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const eur = (c) => "€ " + ((c || 0) / 100).toFixed(2);

const { data: coaches } = await db.from("profiles")
  .select("id, full_name, email, coach_billing_mode").in("role", ["coach", "beheerder"]);

for (const c of coaches || []) {
  const { data: led } = await db.from("coach_ledger")
    .select("delta, reason, created_at").eq("coach_id", c.id).order("created_at");
  const saldo = (led || []).reduce((a, r) => a + Number(r.delta || 0), 0);

  const { data: bk } = await db.from("bookings")
    .select("starts_at, status, coach_billing, coach_charge_cents, coach_invoiced_at")
    .eq("coach_id", c.id).not("coach_billing", "is", null).order("starts_at");
  const opFactuur = (bk || []).filter((b) => b.coach_billing === "invoice" && b.status === "bevestigd");
  const nogTeFact = opFactuur.filter((b) => !b.coach_invoiced_at);
  const alGefact = opFactuur.filter((b) => b.coach_invoiced_at);

  // ALLE betalingen van deze persoon — elke soort, elke status, sinds het begin.
  const { data: pay } = await db.from("payments")
    .select("amount_cents, kind, status, description, created_at").eq("user_id", c.id).order("created_at");

  if (!led?.length && !opFactuur.length && !pay?.length) continue;

  console.log(`\n${"=".repeat(74)}\n${c.full_name}  <${c.email}>   modus nu: ${c.coach_billing_mode}`);
  console.log(`  SESSIETEGOED (coach_ledger): saldo ${saldo}${saldo < 0 ? `  ← STAAT IN DE MIN, ≈ ${eur(Math.abs(saldo) * 1200)}` : ""}`);
  for (const l of led || []) console.log(`     ${l.created_at.slice(0, 10)}  ${Number(l.delta) > 0 ? "+" : ""}${l.delta}  ${l.reason}`);
  if (!led?.length) console.log("     (geen enkele tegoed-beweging — dit is een factuur-coach)");

  console.log(`  OP FACTUUR (op de boekingen): ${nogTeFact.length} nog te factureren = ${eur(nogTeFact.reduce((a, b) => a + (b.coach_charge_cents || 0), 0))} · ${alGefact.length} al gefactureerd`);

  console.log(`  BETALINGEN (alle soorten, alle statussen): ${(pay || []).length}`);
  for (const p of pay || []) {
    console.log(`     ${p.created_at.slice(0, 10)}  ${eur(p.amount_cents)}  ${p.kind}  [${p.status}]  ${p.description || ""}`);
  }
  if (!pay?.length) console.log("     ⚠ NOOIT een betaling geregistreerd in de app");
}

console.log(`\n${"=".repeat(74)}`);
console.log("LET OP: dit toont enkel wat in de app en via Stripe geregistreerd is.");
console.log("Een overschrijving of cash aan de gym die nergens is ingeboekt, staat hier niet in.");
