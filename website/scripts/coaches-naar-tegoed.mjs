// Zet factuur-coaches om naar vooraf betaald tegoed (owner-beslissing 2026-08-06).
//
// VEILIG omdat coach_billing_mode enkel bepaalt hoe TOEKOMSTIGE boekingen worden aangerekend.
// Bestaande boekingen houden hun eigen coach_billing = 'invoice' en coach_charge_cents, en
// invoiceCoachSessions filtert op de BOEKING — niet op de modus van het profiel. Het openstaande
// bedrag blijft dus gewoon te factureren staan. Dat wordt hieronder vóór én na gecontroleerd.
//
//   node --env-file=.env.local scripts/coaches-naar-tegoed.mjs          → toont wat er zou gebeuren
//   node --env-file=.env.local scripts/coaches-naar-tegoed.mjs --doen   → voert het uit
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const doen = process.argv.includes("--doen");
const eur = (c) => "€ " + (c / 100).toFixed(2);

const openstaand = async (coachId) => {
  const { data: b } = await db.from("bookings").select("coach_charge_cents")
    .eq("coach_id", coachId).eq("coach_billing", "invoice").eq("status", "bevestigd").is("coach_invoiced_at", null);
  const { data: p } = await db.from("payments").select("amount_cents")
    .eq("user_id", coachId).eq("status", "onbetaald").eq("kind", "coach_credits");
  return (b || []).reduce((a, x) => a + (x.coach_charge_cents || 0), 0)
       + (p || []).reduce((a, x) => a + (x.amount_cents || 0), 0);
};

const { data: coaches } = await db.from("profiles")
  .select("id, full_name, coach_billing_mode").eq("coach_billing_mode", "invoice");

if (!coaches?.length) { console.log("Geen coaches meer op factuur — niets te doen."); process.exit(0); }

console.log(doen ? "UITVOEREN\n" : "PROEFDRAAI (niets gewijzigd — voeg --doen toe)\n");
for (const c of coaches) {
  const voor = await openstaand(c.id);
  const { data: led } = await db.from("coach_ledger").select("delta").eq("coach_id", c.id);
  const tegoed = (led || []).reduce((a, r) => a + Number(r.delta || 0), 0);
  console.log(`${c.full_name}`);
  console.log(`   modus: invoice → credit`);
  console.log(`   openstaand vóór : ${eur(voor)}`);
  console.log(`   sessietegoed    : ${tegoed}`);

  if (doen) {
    const { error } = await db.from("profiles").update({ coach_billing_mode: "credit" }).eq("id", c.id);
    if (error) { console.error(`   ✗ MISLUKT: ${error.message}`); continue; }
    const na = await openstaand(c.id);
    console.log(`   openstaand ná   : ${eur(na)} ${na === voor ? "✓ ongewijzigd" : "⚠ VERSCHIL — controleer!"}`);
    console.log(`   → kan pas boeken na aanzuivering én aankoop van tegoed`);
  }
  console.log();
}
