// Vult de coachzin van week 1 bij voor plannen die er nog geen hebben.
//
// WAAROM DIT ALS SCRIPT IN DE REPO STAAT. `eersteWeekZin()` draait alleen bij het AANMAKEN van een
// plan. Plannen die al bestonden toen die zin ingevoerd werd (10-09-2026), hebben een lege week 1 —
// uitgerekend het scherm dat na de intake moet overtuigen. Dat is één keer met de hand rechtgezet
// op productie, en dat is precies wat je niet wil: niet reviewbaar, niet herhaalbaar, en na een
// herstel uit back-up opnieuw weg.
//
// Vult ALLEEN waar niets stond. Overschrijft nooit een bestaande analyse.
//
//   node --env-file=.env.local scripts/backfill-week1-zin.mjs         → toont wat het zou doen
//   node --env-file=.env.local scripts/backfill-week1-zin.mjs --doe   → voert het uit

import { createClient } from "@supabase/supabase-js";
import { eersteWeekZin } from "../lib/coaching/plan.js";

const doe = process.argv.includes("--doe");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: plannen, error } = await admin
  .from("coaching_plans").select("id, member_id, sessies_per_week")
  .in("status", ["lopend", "gepauzeerd"]);
if (error) { console.error("plannen niet op te halen:", error.message); process.exit(1); }

let gevuld = 0, overgeslagen = 0;
for (const p of plannen || []) {
  const { data: w } = await admin.from("coaching_weeks")
    .select("id, weekanalyse, program_id").eq("plan_id", p.id).eq("weeknummer", 1).maybeSingle();
  if (!w) { overgeslagen++; continue; }
  if (w.weekanalyse) { overgeslagen++; continue; }

  // Het ECHTE aantal sessies van week 1, niet wat het lid in de wizard vroeg: het model kan een
  // dag onbruikbaar teruggegeven hebben en dan staat er één sessie minder.
  const { count } = await admin.from("coaching_sessions")
    .select("id", { count: "exact", head: true }).eq("week_id", w.id);
  const { data: profiel } = await admin.from("profiles")
    .select("coaching_toon").eq("id", p.member_id).maybeSingle();

  const zin = eersteWeekZin({
    sessiesPerWeek: count || p.sessies_per_week,
    toon: profiel?.coaching_toon,
  });
  console.log(`plan ${p.id}: ${zin}`);
  if (doe) {
    // `.is("weekanalyse", null)` als tweede slot: twee gelijktijdige runs overschrijven elkaar niet.
    const { error: fout } = await admin.from("coaching_weeks")
      .update({ weekanalyse: zin }).eq("id", w.id).is("weekanalyse", null);
    if (fout) { console.error("  → mislukt:", fout.message); continue; }
  }
  gevuld++;
}

console.log(`\n${gevuld} bij te vullen, ${overgeslagen} overgeslagen (geen week 1, of al gevuld).`);
if (!doe) console.log("Proefdraai. Voeg --doe toe om het echt te schrijven.");
