// VOLLEDIGE reconciliatie van het coach-geld, van nul opgebouwd.
//
// Waarom dit bestaat: de losse diagnosescripts keken elk naar één bron (tegoedboek, of factuur,
// of betalingen) en konden elkaar dus tegenspreken. Dit script legt de drie bronnen naast elkaar
// en zoekt waar ze NIET op elkaar aansluiten:
//
//   bron A  bookings      — wat er effectief geboekt/gebruikt is (coach_billing + coach_charge_cents)
//   bron B  coach_ledger  — de tegoedteller (+aankoop/grant, -sessie, +annulatie)
//   bron C  payments      — wat er aan geld geregistreerd staat
//
// De harde vraag per coach: is elke GEBRUIKTE sessie ergens gedekt (betaald tegoed, factuur, of
// bewust gratis)? En staat elke tegoedbeweging tegenover een echte boeking?
//
//   node --env-file=.env.local scripts/audit-coach-geld.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
import { isTestAccount } from "../lib/test-accounts.js";

const eur = (c) => "€ " + ((c || 0) / 100).toFixed(2);
const d = (iso) => (iso ? String(iso).slice(0, 10) : "—");

// Elke query hard controleren. Een typfout in een kolomnaam geeft bij PostgREST `data: null` met
// een error die je stilzwijgend kan negeren — dan telt alles netjes op tot nul en lijkt er niets
// aan de hand. Precies zo kwam er eerder een verkeerd antwoord uit dit script.
const eis = ({ data, error }, wat) => {
  if (error) { console.error(`FOUT bij ${wat}: ${error.message}`); process.exit(1); }
  if (!data) { console.error(`FOUT bij ${wat}: geen data`); process.exit(1); }
  return data;
};

// Iedereen die ooit als coach op een boeking stond OF een tegoedbeweging heeft — niet filteren op
// de huidige rol, want een oud-coach die nog schuld heeft mag niet uit beeld vallen.
const [rBk, rLed, rPay, rProf] = await Promise.all([
  db.from("bookings").select("id, coach_id, user_id, created_at, starts_at, status, persons, coach_billing, coach_charge_cents, coach_invoiced_at, price_cents, paid, payment_source").not("coach_id", "is", null).order("starts_at").limit(5000),
  db.from("coach_ledger").select("coach_id, delta, reason, created_at, ref_id, stripe_ref").order("created_at").limit(5000),
  db.from("payments").select("user_id, amount_cents, kind, status, description, created_at").order("created_at").limit(5000),
  db.from("profiles").select("id, full_name, email, role, coach_billing_mode").limit(5000),
]);
const bkAll = eis(rBk, "bookings");
const ledAll = eis(rLed, "coach_ledger");
const payAll = eis(rPay, "payments");
const profs = eis(rProf, "profiles");
console.log(`Gelezen: ${bkAll.length} coach-boekingen · ${ledAll.length} tegoedregels · ${payAll.length} betalingen`);

const prof = new Map((profs || []).map((p) => [p.id, p]));
const ids = new Set([...(bkAll || []).map((b) => b.coach_id), ...(ledAll || []).map((l) => l.coach_id)]);

let totOpen = 0, totOnverklaard = 0;
const bevindingen = [];
const overgeslagen = [];

for (const id of ids) {
  const p = prof.get(id) || { full_name: "(onbekend profiel)", email: id, coach_billing_mode: "?" };
  // Testaccounts overslaan: toegekend tegoed zonder betaling is daar geen echt geldgat.
  if (isTestAccount(p)) { overgeslagen.push(p.full_name); continue; }
  const bk = (bkAll || []).filter((b) => b.coach_id === id);
  const led = (ledAll || []).filter((l) => l.coach_id === id);
  const pay = (payAll || []).filter((x) => x.user_id === id);

  const bevestigd = bk.filter((b) => b.status === "bevestigd");
  const geannuleerd = bk.filter((b) => b.status !== "bevestigd");

  // Per aanrekenwijze tellen. `null` is het gevaarlijke geval: geboekt zonder enige aanrekening.
  const perModus = {};
  for (const b of bevestigd) {
    const m = b.coach_billing || "GEEN";
    (perModus[m] ||= { n: 0, cents: 0, ongefactureerd: 0 });
    perModus[m].n++;
    perModus[m].cents += b.coach_charge_cents || 0;
    if (m === "invoice" && !b.coach_invoiced_at) perModus[m].ongefactureerd += b.coach_charge_cents || 0;
  }

  const saldo = led.reduce((a, r) => a + Number(r.delta || 0), 0);
  const gekocht = led.filter((r) => Number(r.delta) > 0).reduce((a, r) => a + Number(r.delta), 0);
  const verbruikt = -led.filter((r) => Number(r.delta) < 0).reduce((a, r) => a + Number(r.delta), 0);
  const betaaldGeld = pay.filter((x) => x.kind === "coach_credits" && (x.status === "betaald" || x.status === "paid")).reduce((a, x) => a + x.amount_cents, 0);
  const openGeld = pay.filter((x) => x.kind === "coach_credits" && x.status === "onbetaald").reduce((a, x) => a + x.amount_cents, 0);
  // Bewust kwijtgescholden = een cadeau met een papieren spoor. Dat is géén gat in de boekhouding,
  // maar het mag ook niet als omzet meetellen — daarom een eigen bucket.
  const kwijtGeld = pay.filter((x) => x.kind === "coach_credits" && x.status === "kwijtgescholden").reduce((a, x) => a + x.amount_cents, 0);

  console.log(`\n${"=".repeat(78)}`);
  console.log(`${p.full_name}  <${p.email}>   rol: ${p.role} · modus nu: ${p.coach_billing_mode}`);
  console.log(`  BOEKINGEN: ${bevestigd.length} bevestigd, ${geannuleerd.length} geannuleerd/ander`);
  for (const [m, v] of Object.entries(perModus)) {
    console.log(`     ${m.padEnd(8)} ${String(v.n).padStart(3)} sessies · aangerekend ${eur(v.cents)}${m === "invoice" ? ` · nog te factureren ${eur(v.ongefactureerd)}` : ""}`);
  }
  console.log(`  TEGOED: saldo ${saldo}  (gekocht/toegekend ${gekocht}, verbruikt ${verbruikt})`);
  console.log(`  GELD:   betaald ${eur(betaaldGeld)} · open post ${eur(openGeld)}${kwijtGeld ? ` · kwijtgescholden ${eur(kwijtGeld)}` : ""} · ${pay.length} betaalrij(en) totaal`);

  // ---- Aansluitingscontroles ----
  // Koppelen via ref_id, niet via aantallen. Een 'sessie'-regel en de 'annulatie' die ze terugdraait
  // dragen allebei het boeking-id, dus per boeking is exact na te gaan of ze afgeboekt is en of ze
  // bij annulatie is teruggestort. Aantallen vergelijken gaf een vals alarm: een afboeking van een
  // later geannuleerde sessie hoort er wél te staan (mét terugstorting ernaast).
  const afgeboekt = new Set(led.filter((r) => Number(r.delta) < 0 && r.ref_id).map((r) => r.ref_id));
  const teruggestort = new Set(led.filter((r) => Number(r.delta) > 0 && r.reason === "annulatie" && r.ref_id).map((r) => r.ref_id));

  // 1a. Tegoed-boeking zonder afboeking = gratis gereden.
  const nietAfgeboekt = bk.filter((b) => b.coach_billing === "credit" && !afgeboekt.has(b.id));
  if (nietAfgeboekt.length) {
    const t = `${nietAfgeboekt.length} tegoed-boeking(en) zonder afboeking in het tegoedboek → gratis gereden (${nietAfgeboekt.map((b) => d(b.starts_at)).join(", ")})`;
    console.log(`  ⚠ ${t}`);
    bevindingen.push([p.full_name, t]);
    totOnverklaard += nietAfgeboekt.length * 1200;
  }

  // 1b. Geannuleerde tegoed-boeking zonder terugstorting = de coach betaalde voor niets.
  const nietTerug = bk.filter((b) => b.status !== "bevestigd" && afgeboekt.has(b.id) && !teruggestort.has(b.id));
  if (nietTerug.length) {
    const t = `${nietTerug.length} geannuleerde sessie(s) waarvan het tegoed NIET is teruggestort → coach ${eur(nietTerug.length * 1200)} te veel betaald (${nietTerug.map((b) => d(b.starts_at)).join(", ")})`;
    console.log(`  ⚠ ${t}`);
    bevindingen.push([p.full_name, t]);
  }

  // 1c. Afboeking die naar geen enkele boeking verwijst (of naar een verwijderde).
  // De omzetting van 2026-08-07 (factuurschuld → negatief tegoed) hoort hier NIET bij: die regels
  // hebben met opzet geen boeking, ze vervangen een reeks boekingen door één saldo.
  const bkIds = new Set(bk.map((b) => b.id));
  const wees = led.filter((r) => Number(r.delta) < 0 && !String(r.reason || "").startsWith("omzetting:") && (!r.ref_id || !bkIds.has(r.ref_id)));
  if (wees.length) {
    const t = `${wees.length} afboeking(en) zonder bijhorende boeking (${wees.map((r) => d(r.created_at)).join(", ")})`;
    console.log(`  ⚠ ${t}`);
    bevindingen.push([p.full_name, t]);
  }

  // 2. Geboekt zonder enige aanrekening.
  //
  // De onboarding van 2026-06-22 is hierop een bekende, door de eigenaar goedgekeurde uitzondering:
  // toen is het bestaande rooster van de coaches in één keer ingevoerd, zonder tegoed af te boeken
  // (7 sessies, € 84). Die zijn bewust weggegeven en hoeven niet elke keer opnieuw als probleem te
  // verschijnen. Alles wat NA die dag geboekt is zonder aanrekening, is dat wél — dan lekt er geld
  // weg via een pad dat we niet kennen. Vandaar de scheiding in plaats van de check te schrappen.
  const ONBOARDING = Date.parse("2026-06-23T00:00:00Z");
  const nietAangerekend = bevestigd.filter((b) => !b.coach_billing);
  // Op AANMAAKdatum beoordelen, niet op de sessiedatum: de onboarding-batch is op 22 juni ingevoerd
  // maar bevat sessies tot begin juli. Op starts_at filteren zou die alsnog als nieuw lek markeren.
  const oud = nietAangerekend.filter((b) => Date.parse(b.created_at) < ONBOARDING);
  const nieuw = nietAangerekend.filter((b) => !oud.includes(b));
  if (oud.length) console.log(`  · ${oud.length} sessie(s) zonder aanrekening uit de onboarding van 22 juni — goedgekeurd, geen actie`);
  if (nieuw.length) {
    const t = `${nieuw.length} sessie(s) NA de onboarding zonder enige aanrekening → hier lekt geld weg (${nieuw.map((b) => d(b.starts_at)).join(", ")})`;
    console.log(`  ⚠ ${t}`);
    bevindingen.push([p.full_name, t]);
    totOnverklaard += nieuw.length * 1200;
  }

  // 3. Tegoed toegekend zonder dat er geld tegenover staat.
  //    Een 'aankoop' hoort een betaalde post te hebben, een 'grant' minstens een open post.
  const toegekend = led.filter((r) => Number(r.delta) > 0 && r.reason !== "annulatie");
  const toegekendAantal = toegekend.reduce((a, r) => a + Number(r.delta), 0);
  // Kwijtgescholden telt als gedekt: er is een bewuste beslissing genomen en vastgelegd. Zonder
  // dat zou elk cadeau eeuwig als "geld zonder spoor" blijven terugkomen in deze audit.
  const gedektDoorGeld = Math.round((betaaldGeld + openGeld + kwijtGeld) / 1200);
  if (toegekendAantal > gedektDoorGeld) {
    const gat = (toegekendAantal - gedektDoorGeld) * 1200;
    const t = `${toegekendAantal} sessies toegekend maar slechts ${gedektDoorGeld} gedekt door een betaalpost → ${eur(gat)} zonder financieel spoor`;
    console.log(`  ⚠ ${t}`);
    bevindingen.push([p.full_name, t]);
    totOnverklaard += gat;
  }

  // 4. Negatief saldo = meer geboekt dan gekocht.
  if (saldo < 0) {
    const t = `tegoedsaldo ${saldo} → ${eur(Math.abs(saldo) * 1200)} te innen`;
    console.log(`  ⚠ ${t}`);
    bevindingen.push([p.full_name, t]);
    totOpen += Math.abs(saldo) * 1200;
  }

  // 5. Openstaand op factuur + onbetaalde posten.
  const factuurOpen = perModus.invoice?.ongefactureerd || 0;
  totOpen += factuurOpen + openGeld;

  // Detailregels, zodat elk bedrag hierboven na te tellen is.
  if (bk.length) {
    console.log(`  — sessies (ook geannuleerde) —`);
    for (const x of bk) {
      const eigen = x.user_id === x.coach_id ? "eigen client" : "lid";
      const st = x.status === "bevestigd" ? "" : "  " + x.status.toUpperCase();
      const tg = x.coach_billing === "credit" ? (afgeboekt.has(x.id) ? "  afgeboekt" : "  ⚠ NIET afgeboekt") + (x.status !== "bevestigd" ? (teruggestort.has(x.id) ? " + teruggestort" : " + ⚠ niet teruggestort") : "") : "";
      const fa = x.coach_billing === "invoice" ? (x.coach_invoiced_at ? "  [gefactureerd]" : "  [NIET gefactureerd]") : "";
      console.log(`     ${d(x.starts_at)}  ${(x.coach_billing || "GEEN").padEnd(8)} ${eur(x.coach_charge_cents).padStart(9)}  ${eigen}${st}${tg}${fa}`);
    }
  }
  if (led.length) {
    console.log(`  — tegoedboek —`);
    for (const r of led) console.log(`     ${d(r.created_at)}  ${Number(r.delta) > 0 ? "+" : ""}${r.delta}  ${r.reason}${r.ref_id ? "" : "   (geen boeking gekoppeld)"}`);
  }
  if (pay.length) {
    console.log(`  — betalingen —`);
    for (const x of pay) console.log(`     ${d(x.created_at)}  ${eur(x.amount_cents).padStart(9)}  ${x.kind}  [${x.status}]  ${x.description || ""}`);
  }
}

console.log(`\n${"=".repeat(78)}`);
console.log(`TE INNEN (factuur + open posten + negatief saldo): ${eur(totOpen)}`);
console.log(`ZONDER FINANCIEEL SPOOR (weggegeven of niet aangerekend): ${eur(totOnverklaard)}`);
console.log(`\nAANSLUITINGSPROBLEMEN: ${bevindingen.length}`);
for (const [naam, t] of bevindingen) console.log(`  • ${naam}: ${t}`);
if (overgeslagen.length) console.log(`\nOvergeslagen testaccount(s): ${overgeslagen.join(", ")}`);
console.log(`\nBlinde vlek: cash of overschrijving die nooit is ingeboekt, staat in geen van deze drie bronnen.`);
