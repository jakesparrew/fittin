// Zaalcheck en netheid — de regels zonder databank (getest in lib/netheid.test.js).
//
// Wie liet de zaal zo achter? Dat is enkel een VERMOEDEN: er is geen deurlog per persoon, codes worden gedeeld,
// en de boeker is niet altijd wie de rommel maakte. Daarom:
//   · het lid ziet dit nooit — enkel de uitbater;
//   · één melding bewijst niets, pas een patroon (≥ 3 checks) geeft een kleur;
//   · er volgt nooit automatisch iets. Een herinnering stuurt de uitbater zelf, met de hand.

export const STAAT = {
  netjes: { l: "Netjes", e: "👍" },
  rommel: { l: "Niet netjes", e: "🧼" },
  stuk: { l: "Iets stuk", e: "🔧" },
};
export const TAGS = [
  { v: "handdoeken", l: "Handdoeken" },
  { v: "flessen", l: "Flessen/afval" },
  { v: "gewichten", l: "Gewichten niet teruggelegd" },
  { v: "toestellen", l: "Toestellen niet afgeveegd" },
  { v: "vloer", l: "Vloer" },
  { v: "kleedkamer", l: "Kleedkamer/toilet" },
  { v: "licht", l: "Licht/deur" },
];
export const TAG_SET = new Set(TAGS.map((t) => t.v));

// Tot wanneer mag je inchecken: 10 min vóór de start tot 2 uur na het einde.
export const CHECK_VOOR_MS = 10 * 60000;
export const CHECK_NA_MS = 2 * 3600000;
export const magInchecken = (b, nu = Date.now()) =>
  !!b && b.status === "bevestigd" &&
  nu >= new Date(b.starts_at).getTime() - CHECK_VOOR_MS &&
  nu <= new Date(b.ends_at).getTime() + CHECK_NA_MS;

// Hoe lang mag er tussen de vorige sessie en deze zitten om die vorige nog verantwoordelijk te houden?
export const MAX_GAT_MS = 3 * 3600000;

/**
 * Wie zat er vóór deze sessie in de zaal?
 * @param deze    { id, user_id, starts_at }
 * @param eerder  bevestigde boekingen van dezelfde dag die vóór `deze` eindigden: { id, user_id, coach_id, ends_at }
 * @returns { booking, kind, user } of null
 *   kind 'eigen' = dezelfde persoon (meerdere uren na elkaar) → niemand anders aanwijzen
 *   kind 'pt'    = een coachsessie (coach ≠ boeker) → de COACH was professioneel aanwezig, niet de klant
 *   kind 'lid'   = een gewone sessie
 *   null         = eerste van de dag, of een gat van meer dan 3 uur
 */
export function vorigeSessie(deze, eerder) {
  const start = new Date(deze.starts_at).getTime();
  const dag = dagVan(deze.starts_at);
  const kandidaten = (eerder || [])
    .filter((b) => b.id !== deze.id && dagVan(b.ends_at) === dag && new Date(b.ends_at).getTime() <= start + 60000)
    .sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at));
  const v = kandidaten[0];
  if (!v) return null;
  if (start - new Date(v.ends_at).getTime() > MAX_GAT_MS) return null;
  if (v.user_id === deze.user_id) return { booking: v.id, kind: "eigen", user: null };
  if (v.coach_id && v.coach_id !== v.user_id) return { booking: v.id, kind: "pt", user: v.coach_id };
  return { booking: v.id, kind: "lid", user: v.user_id };
}
const DAG = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" });
const UUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false });
const dagVan = (iso) => DAG.format(new Date(iso));

/**
 * De netheidsscore van één persoon over de checks waar hij de VORIGE was (laatste 90 dagen).
 * netjes +1 · rommel −1 · rommel met foto of oordeel 'terecht' −2 · oordeel 'onterecht' 0 · stuk telt niet
 * (kapotte toestellen zijn zelden iemands schuld).
 * @returns { score, aantal, rommel30, kleur: 'groen'|'oranje'|'rood'|null }  null = te weinig gegevens
 */
export function netheidsScore(checks, nu = Date.now()) {
  const d90 = nu - 90 * 86400000, d30 = nu - 30 * 86400000;
  let score = 0, aantal = 0, rommel30 = 0;
  for (const c of checks || []) {
    const t = new Date(c.created_at).getTime();
    if (t < d90 || c.state === "stuk") continue;
    aantal++;
    if (c.owner_verdict === "onterecht") continue;
    if (c.state === "netjes") score += 1;
    else if (c.state === "rommel") {
      const zwaar = c.owner_verdict === "terecht" || !!c.photo_path;
      score -= zwaar ? 2 : 1;
      if (t >= d30 && zwaar) rommel30++;
    }
  }
  let kleur = null;
  if (aantal >= 3) kleur = rommel30 >= 2 ? "rood" : score >= aantal / 2 ? "groen" : "oranje";
  return { score, aantal, rommel30, kleur };
}
export const KLEUR = {
  groen: { l: "Laat netjes achter", dot: "bg-accent" },
  oranje: { l: "Wisselend", dot: "bg-amber-400" },
  rood: { l: "Aandacht", dot: "bg-red-500" },
};

// Uurband voor de trend: rommel zit vaak in één deel van de dag.
export function uurband(iso) {
  const u = Number(UUR.format(new Date(iso))) % 24;
  return u < 12 ? "ochtend" : u < 17 ? "middag" : "avond";
}

/** Percentage "netjes" per week, met het aantal antwoorden. Weken met < 3 antwoorden zijn 'te weinig'. */
export function weekTrend(checks, weekVan) {
  const per = new Map();
  for (const c of checks || []) {
    if (c.state === "stuk") continue;
    const w = weekVan(c.created_at);
    const x = per.get(w) || { week: w, netjes: 0, totaal: 0 };
    x.totaal++;
    if (c.state === "netjes") x.netjes++;
    per.set(w, x);
  }
  return [...per.values()].sort((a, b) => a.week.localeCompare(b.week))
    .map((x) => ({ ...x, pct: x.totaal ? Math.round((x.netjes / x.totaal) * 100) : null, teWeinig: x.totaal < 3 }));
}

/** Twee keer 'rommel' na elkaar (per gym, chronologisch) → alarm voor de uitbater. */
export const tweeKeerRommel = (laatsteTwee) =>
  laatsteTwee.length === 2 && laatsteTwee.every((c) => c.state === "rommel");
