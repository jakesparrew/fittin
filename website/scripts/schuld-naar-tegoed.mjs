// Zet openstaande coachschuld om naar NEGATIEF SESSIETEGOED (owner-voorstel 2026-08-07).
//
// Het idee: in plaats van drie mechanismen naast elkaar (nog te factureren sessies, onbetaalde
// factuurposten, negatief saldo) is er nog maar ÉÉN getal per coach — zijn tegoed. Staat het onder
// nul, dan is dat zijn schuld, en hij kan pas weer boeken door tegoed bij te kopen.
//
// PROEFDRAAI STANDAARD. Zonder --doen wordt er niets geschreven.
//   node --env-file=.env.local scripts/schuld-naar-tegoed.mjs           → toon wat er zou gebeuren
//   node --env-file=.env.local scripts/schuld-naar-tegoed.mjs --doen    → voer uit
//   ... --posten-ook   → reken óók onbetaalde tegoed-facturen om (zie WAARSCHUWING onderaan)
//
// Dit is een LIVE database. Daarom: niets verwijderen, alles bijboeken. Elke omzetting laat een
// spoor na in coach_ledger met een eigen reden, zodat ze terug te vinden en terug te draaien is.
import { createClient } from "@supabase/supabase-js";
import { isTestAccount } from "../lib/test-accounts.js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const doen = process.argv.includes("--doen");
const postenOok = process.argv.includes("--posten-ook");
const eur = (c) => "€ " + ((c || 0) / 100).toFixed(2);
const PRIJS = 1200; // € 12 per sessie — de enige coachprijs (zie CLAUDE.md)

const REDEN_SESSIES = "omzetting: factuursessies naar tegoed";
const REDEN_POST = "omzetting: onbetaalde tegoedfactuur teruggedraaid";

const eis = ({ data, error }, wat) => {
  if (error) { console.error(`FOUT bij ${wat}: ${error.message}`); process.exit(1); }
  return data;
};

const { data: gyms } = await db.from("gyms").select("id, name");

for (const gym of gyms || []) {
  console.log(`\n${"=".repeat(78)}\n${gym.name}   ${doen ? "UITVOEREN" : "PROEFDRAAI — er wordt niets gewijzigd"}\n`);

  const profs = eis(await db.from("profiles").select("id, full_name, email").eq("gym_id", gym.id), "profiles");
  const naam = new Map(profs.map((p) => [p.id, p.full_name]));
  const testIds = new Set(profs.filter(isTestAccount).map((p) => p.id));

  const led = eis(await db.from("coach_ledger").select("coach_id, delta, reason").eq("gym_id", gym.id).limit(5000), "coach_ledger");
  const saldo = new Map();
  for (const l of led) saldo.set(l.coach_id, (saldo.get(l.coach_id) || 0) + Number(l.delta || 0));

  // Al eens omgezet? Dan niet nog eens — anders boek je de schuld dubbel af.
  const alGedaan = new Set(led.filter((l) => l.reason === REDEN_SESSIES || l.reason === REDEN_POST).map((l) => l.coach_id));

  const bk = eis(await db.from("bookings")
    .select("id, coach_id, starts_at, coach_charge_cents")
    .eq("gym_id", gym.id).eq("coach_billing", "invoice").eq("status", "bevestigd").is("coach_invoiced_at", null).limit(5000), "bookings");

  const pay = eis(await db.from("payments")
    .select("id, user_id, amount_cents, description")
    .eq("gym_id", gym.id).eq("kind", "coach_credits").eq("status", "onbetaald").limit(5000), "payments");

  // --- plan opstellen ---
  const plan = new Map();
  const van = (id) => {
    if (!plan.has(id)) plan.set(id, { sessies: [], sessieCents: 0, posten: [], postCents: 0 });
    return plan.get(id);
  };
  for (const b of bk) { if (testIds.has(b.coach_id)) continue; const r = van(b.coach_id); r.sessies.push(b); r.sessieCents += b.coach_charge_cents || 0; }
  if (postenOok) for (const p of pay) { if (testIds.has(p.user_id)) continue; const r = van(p.user_id); r.posten.push(p); r.postCents += p.amount_cents || 0; }

  if (!plan.size) { console.log("Niets om te doen — geen openstaande factuursessies."); continue; }

  let totaalAf = 0;
  for (const [id, r] of plan) {
    const voor = saldo.get(id) || 0;
    const afSessies = r.sessieCents / PRIJS;
    // Een onbetaalde factuur draait de ooit toegekende sessies terug: wat niet betaald is, is geen tegoed.
    const afPosten = r.postCents / PRIJS;
    const na = voor - afSessies - afPosten;
    totaalAf += r.sessieCents + r.postCents;

    console.log(`${naam.get(id) || id}${alGedaan.has(id) ? "   ⚠ AL EERDER OMGEZET — wordt overgeslagen" : ""}`);
    if (r.sessies.length) console.log(`   ${r.sessies.length} factuursessies  ${eur(r.sessieCents)}  → −${afSessies} tegoed`);
    if (r.posten.length) console.log(`   ${r.posten.length} onbetaalde factuur  ${eur(r.postCents)}  → −${afPosten} tegoed (toekenning teruggedraaid)`);
    console.log(`   tegoed: ${voor}  →  ${na}     schuld wordt ${na < 0 ? eur(Math.abs(na) * PRIJS) : "€ 0,00"}`);
    console.log(`   ${na < 0 ? `moet ${Math.abs(na)} sessies bijkopen om weer te kunnen boeken` : "kan boeken"}`);
    console.log();
  }
  console.log(`TOTAAL om te zetten: ${eur(totaalAf)}`);

  if (!doen) { console.log("\n(proefdraai — voeg --doen toe om dit echt uit te voeren)"); continue; }

  // --- uitvoeren ---
  for (const [id, r] of plan) {
    if (alGedaan.has(id)) { console.log(`overgeslagen (al omgezet): ${naam.get(id)}`); continue; }

    if (r.sessies.length) {
      const { error } = await db.from("coach_ledger").insert({
        gym_id: gym.id, coach_id: id, delta: -(r.sessieCents / PRIJS), reason: REDEN_SESSIES,
      });
      if (error) { console.error(`✗ ${naam.get(id)}: tegoedregel mislukt — ${error.message}`); continue; }
      // Pas NA de tegoedregel de boekingen afvinken. Andersom zou een fout halverwege de schuld
      // laten verdwijnen zonder dat ze ergens anders staat.
      const { error: e2 } = await db.from("bookings")
        .update({ coach_invoiced_at: new Date().toISOString() })
        .in("id", r.sessies.map((b) => b.id));
      if (e2) console.error(`⚠ ${naam.get(id)}: tegoed afgeboekt maar boekingen niet afgevinkt — ${e2.message}`);
    }

    if (r.posten.length) {
      const { error } = await db.from("coach_ledger").insert({
        gym_id: gym.id, coach_id: id, delta: -(r.postCents / PRIJS), reason: REDEN_POST,
      });
      if (error) { console.error(`✗ ${naam.get(id)}: tegoedregel mislukt — ${error.message}`); continue; }
      const { error: e2 } = await db.from("payments").update({ status: "geannuleerd" }).in("id", r.posten.map((p) => p.id));
      if (e2) console.error(`⚠ ${naam.get(id)}: post niet geannuleerd — ${e2.message}`);
    }
    console.log(`✓ ${naam.get(id)} omgezet`);
  }
}

console.log(`
WAARSCHUWING bij --posten-ook: een onbetaalde tegoedfactuur terugdraaien betekent dat de coach de
nog ONGEBRUIKTE sessies van die factuur kwijtraakt. Bij Thomas Lesage gaat het om € 120 voor 10
sessies waarvan hij er 5 gebruikte: na de omzetting staat hij op −5 en is hij dus € 60 verschuldigd
in plaats van € 120. Dat is een commerciële keuze ("je betaalt enkel wat je verbruikt hebt"),
geen technische. Zonder deze vlag blijft zijn factuur van € 120 gewoon openstaan.`);
