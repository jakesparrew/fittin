// Zet openstaande coachschuld om naar NEGATIEF SESSIETEGOED (owner-beslissing 2026-08-07).
//
// Het model wordt: ÉÉN getal per coach — zijn sessietegoed. Staat het onder nul, dan is dat zijn
// schuld, en hij kan pas weer boeken door tegoed bij te kopen. "Op factuur" bestaat niet meer:
// owner: "Er moet geen op factuur meer zijn, coaches moeten gewoon sessies kopen of direct betalen."
//
// Drie soorten omzetting:
//   1. nog te factureren sessies  → negatief tegoed (€ 96 = −8, € 60 = −5)
//   2. de onbetaalde factuur van Thomas Lesage → KWIJTGESCHOLDEN. Owner: "die kreeg hij gratis,
//      alle 10 moeten niet aangerekend worden." Hij houdt dus zijn resterende tegoed; enkel de
//      betaalpost verdwijnt uit de openstaande bedragen.
//   3. wie al negatief staat, blijft staan — daar valt niets om te zetten.
//
// PROEFDRAAI STANDAARD. Zonder --doen wordt er niets geschreven.
//   node --env-file=.env.local scripts/schuld-naar-tegoed.mjs           → toon wat er zou gebeuren
//   node --env-file=.env.local scripts/schuld-naar-tegoed.mjs --doen    → voer uit
//
// Dit is een LIVE database. Daarom wordt er NIETS verwijderd: elke omzetting is een bijgeboekte
// tegoedregel met een eigen reden, en een kwijtschelding is een statuswijziging. Alles is terug te
// vinden en terug te draaien (zie ONGEDAAN MAKEN onderaan).
import { createClient } from "@supabase/supabase-js";
import { isTestAccount } from "../lib/test-accounts.js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const doen = process.argv.includes("--doen");
const eur = (c) => "€ " + ((c || 0) / 100).toFixed(2);
const PRIJS = 1200; // € 12 per sessie — de enige coachprijs (zie CLAUDE.md)

const REDEN_SESSIES = "omzetting: factuursessies naar tegoed";
const KWIJT = "kwijtgescholden";
// Enkel deze post wordt kwijtgescholden. Bewust op id-niveau vastgelegd in plaats van "alle
// onbetaalde posten": een toekomstige onbetaalde factuur mag hier niet stilzwijgend in meelopen.
const KWIJT_POSTEN = new Set(["thomas.lesage10@hotmail.com"]);

const eis = ({ data, error }, wat) => {
  if (error) { console.error(`FOUT bij ${wat}: ${error.message}`); process.exit(1); }
  return data;
};

const { data: gyms } = await db.from("gyms").select("id, name");

for (const gym of gyms || []) {
  console.log(`\n${"=".repeat(78)}\n${gym.name}   ${doen ? "UITVOEREN" : "PROEFDRAAI — er wordt niets gewijzigd"}\n`);

  const profs = eis(await db.from("profiles").select("id, full_name, email").eq("gym_id", gym.id), "profiles");
  const naam = new Map(profs.map((p) => [p.id, p.full_name]));
  const mail = new Map(profs.map((p) => [p.id, String(p.email || "").toLowerCase()]));
  const testIds = new Set(profs.filter(isTestAccount).map((p) => p.id));

  const led = eis(await db.from("coach_ledger").select("coach_id, delta, reason").eq("gym_id", gym.id).limit(5000), "coach_ledger");
  const saldo = new Map();
  for (const l of led) saldo.set(l.coach_id, (saldo.get(l.coach_id) || 0) + Number(l.delta || 0));
  // Al eens omgezet? Dan niet nog eens — anders boek je de schuld dubbel af.
  const alGedaan = new Set(led.filter((l) => l.reason === REDEN_SESSIES).map((l) => l.coach_id));

  const bk = eis(await db.from("bookings")
    .select("id, coach_id, starts_at, coach_charge_cents")
    .eq("gym_id", gym.id).eq("coach_billing", "invoice").eq("status", "bevestigd").is("coach_invoiced_at", null).limit(5000), "bookings");

  const pay = eis(await db.from("payments")
    .select("id, user_id, amount_cents, description")
    .eq("gym_id", gym.id).eq("kind", "coach_credits").eq("status", "onbetaald").limit(5000), "payments");

  // --- plan ---
  const plan = new Map();
  const van = (id) => {
    if (!plan.has(id)) plan.set(id, { sessies: [], sessieCents: 0, kwijt: [], kwijtCents: 0 });
    return plan.get(id);
  };
  for (const b of bk) { if (testIds.has(b.coach_id)) continue; const r = van(b.coach_id); r.sessies.push(b); r.sessieCents += b.coach_charge_cents || 0; }
  for (const p of pay) {
    if (testIds.has(p.user_id)) continue;
    if (!KWIJT_POSTEN.has(mail.get(p.user_id))) {
      console.log(`⚠ onbetaalde post van ${naam.get(p.user_id)} (${eur(p.amount_cents)}) staat NIET in de kwijtscheldingslijst — blijft openstaan.`);
      continue;
    }
    const r = van(p.user_id); r.kwijt.push(p); r.kwijtCents += p.amount_cents || 0;
  }

  if (!plan.size) { console.log("Niets om te doen."); continue; }

  let totaalSchuld = 0, totaalKwijt = 0;
  for (const [id, r] of plan) {
    const voor = saldo.get(id) || 0;
    const af = r.sessieCents / PRIJS;
    const na = voor - af;
    totaalSchuld += r.sessieCents;
    totaalKwijt += r.kwijtCents;

    console.log(`${naam.get(id) || id}${alGedaan.has(id) ? "   ⚠ AL EERDER OMGEZET — wordt overgeslagen" : ""}`);
    if (r.sessies.length) {
      console.log(`   ${r.sessies.length} factuursessies  ${eur(r.sessieCents)}  → tegoed ${voor} wordt ${na}`);
      console.log(`   moet ${Math.abs(na)} sessies bijkopen om weer te kunnen boeken`);
    }
    if (r.kwijt.length) {
      console.log(`   ${eur(r.kwijtCents)} factuur KWIJTGESCHOLDEN (gratis gekregen) — tegoed blijft ${voor}`);
      console.log(`   geen schuld meer`);
    }
    console.log();
  }
  console.log(`Omgezet naar negatief tegoed : ${eur(totaalSchuld)}`);
  console.log(`Kwijtgescholden              : ${eur(totaalKwijt)}`);

  if (!doen) { console.log("\n(proefdraai — voeg --doen toe om dit echt uit te voeren)"); continue; }

  // --- uitvoeren ---
  for (const [id, r] of plan) {
    if (r.sessies.length) {
      if (alGedaan.has(id)) { console.log(`overgeslagen (al omgezet): ${naam.get(id)}`); }
      else {
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
        else console.log(`✓ ${naam.get(id)}: ${eur(r.sessieCents)} omgezet naar tegoed`);
      }
    }
    if (r.kwijt.length) {
      const { error } = await db.from("payments").update({ status: KWIJT }).in("id", r.kwijt.map((p) => p.id));
      if (error) console.error(`✗ ${naam.get(id)}: kwijtschelden mislukt — ${error.message}`);
      else console.log(`✓ ${naam.get(id)}: ${eur(r.kwijtCents)} kwijtgescholden`);
    }
  }
}

console.log(`
ONGEDAAN MAKEN: verwijder de coach_ledger-regels met reason '${REDEN_SESSIES}', zet
coach_invoiced_at terug op null voor de betrokken boekingen, en zet de kwijtgescholden posten
terug op 'onbetaald'. Er is niets gewist, dus alles is herstelbaar.`);
