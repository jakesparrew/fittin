// Fittin' Punten — de regels, zonder databank. Alles hier is puur en getest (lib/punten.test.js).
//
// Plan: docs/plans/2026-09-18-gamification-community.md (v3). De twee tellers:
//   · lifetime — alles wat ooit verdiend werd. Bepaalt het niveau. Inwisselen of vervallen haalt er NIETS af,
//     enkel een correctie (geannuleerde/terugbetaalde sessie) of een handmatige min.
//   · saldo    — wat je kan uitgeven. Inwisselen haalt er 300 af.

// ---------------------------------------------------------------------------------------------------------------
// Waarden. De databank bewaart enkel afwijkingen (gamification_settings.waarden); dit zijn de standaarden.
// ---------------------------------------------------------------------------------------------------------------
export const WAARDEN = {
  // training
  sessie: 10,          // eigen sessie, na afloop
  deelnemer: 5,        // meegekomen als deelnemer én bevestigd ("Ik kom")
  week: 5,             // week met minstens je weekdoel
  reeks4: 20,          // elke 4 weken op rij
  log: 3,              // training gelogd (1/dag)
  gewicht: 3,          // gewicht/meting (1/week)
  rating: 2,           // sterren na de sessie
  rustig_factor: 2,    // sessie op een rustig uur telt dubbel
  // zaal
  zaalcheck: 3,
  zaalfoto: 2,
  netjes: 1,           // "ik heb alles teruggelegd"
  // betalen en blijven
  abo_start: 50,
  abo_maand: 20,
  kaart: 30,
  // groei
  gast_bevestigd: 5,   // voor de gastheer, als de gast bevestigt
  gast_account: 20,    // gast/vriend maakt een account
  vriend_eerste: 100,  // vriend doet zijn eerste BETAALDE sessie — voor de aanbrenger
  vriend_eerste_zelf: 25, // …en voor de vriend zelf
  vriend_abo: 150,     // vriend neemt abonnement of kaart
  // starter-quest
  quest_profiel: 20,
  quest_boek: 10,
  quest_eerste: 50,
  quest_tweede: 40,    // 2e sessie binnen 14 dagen na de eerste
  quest_derde: 30,     // 3e sessie binnen 30 dagen na de eerste
  quest_bron: 5,       // "hoe vond je ons?"
  // AI-coach
  coach_intake: 30,
  coach_checkin: 5,
  coach_afvink: 3,
  coach_mijlpaal: 20,
  coach_plan: 50,
  // community
  event: 10,
  gymdoel: 25,
  scorebord_1: 50,
  scorebord_2: 30,
  scorebord_3: 20,
  verbeterd: 50,
  aanbrenger: 50,
};

export const waarde = (settings, key) => {
  const eigen = settings?.waarden?.[key];
  return Number.isFinite(Number(eigen)) && eigen !== null && eigen !== "" ? Number(eigen) : WAARDEN[key] ?? 0;
};
// Een actie staat uit als de waarde op 0 gezet is.
export const staatAan = (settings, key) => waarde(settings, key) > 0;

// ---------------------------------------------------------------------------------------------------------------
// Soorten — voor "waarom heb ik deze punten?" en de balken op het dashboard.
// ---------------------------------------------------------------------------------------------------------------
export const SOORT = {
  sessie: { l: "Sessie", e: "🏋️", groep: "Training" },
  deelnemer: { l: "Meegetraind", e: "🤝", groep: "Training" },
  week: { l: "Week gehaald", e: "📅", groep: "Training" },
  reeks4: { l: "4 weken op rij", e: "🔥", groep: "Training" },
  log: { l: "Training gelogd", e: "📝", groep: "Training" },
  gewicht: { l: "Gewicht bijgehouden", e: "⚖️", groep: "Training" },
  rating: { l: "Sessie beoordeeld", e: "⭐", groep: "Ervaring" },
  zaalcheck: { l: "Zaalcheck", e: "🧼", groep: "Zaal" },
  zaalfoto: { l: "Foto bij zaalcheck", e: "📷", groep: "Zaal" },
  netjes: { l: "Netjes achtergelaten", e: "✅", groep: "Zaal" },
  abo_start: { l: "Abonnement gestart", e: "⭐", groep: "Klant" },
  abo_maand: { l: "Abonnementsmaand", e: "💳", groep: "Klant" },
  kaart: { l: "Beurtenkaart", e: "🎟️", groep: "Klant" },
  gast_bevestigd: { l: "Gast bevestigd", e: "👋", groep: "Groei" },
  gast_account: { l: "Vriend maakte account", e: "👋", groep: "Groei" },
  vriend_eerste: { l: "Vriend trainde", e: "🎉", groep: "Groei" },
  vriend_eerste_zelf: { l: "Welkom via een vriend", e: "🎉", groep: "Groei" },
  vriend_abo: { l: "Vriend werd klant", e: "🏆", groep: "Groei" },
  quest: { l: "Startersopdracht", e: "🚀", groep: "Starter" },
  coach: { l: "AI-coach", e: "🤖", groep: "Coach" },
  event: { l: "Event", e: "🎪", groep: "Community" },
  gymdoel: { l: "Gymdoel gehaald", e: "🎯", groep: "Community" },
  scorebord: { l: "Scorebord", e: "🏅", groep: "Community" },
  badge: { l: "Badge", e: "🏅", groep: "Community" },
  inwissel: { l: "Gratis sessie", e: "🎁", groep: "Uitgegeven" },
  verval: { l: "Vervallen", e: "⌛", groep: "Uitgegeven" },
  correctie: { l: "Correctie", e: "↩️", groep: "Correctie" },
  handmatig: { l: "Aanpassing door Fittin'", e: "✏️", groep: "Correctie" },
};
export const soortLabel = (kind) => SOORT[kind] || { l: kind, e: "•", groep: "Overig" };

// Wat telt waarvoor. Inwisselen en vervallen raken het saldo, niet het niveau. Scorebord- en handmatige punten
// tellen niet mee voor het klassement van de maand erna (anders sneeuwbalt een voorsprong).
export const NIET_LIFETIME = new Set(["inwissel", "verval"]);
export const NIET_KLASSEMENT = new Set(["inwissel", "verval", "scorebord", "handmatig"]);

export function tellers(rijen, { sinds = null } = {}) {
  let lifetime = 0, saldo = 0, klassement = 0;
  const t0 = sinds ? new Date(sinds).getTime() : null;
  for (const r of rijen || []) {
    const p = Number(r.points) || 0;
    saldo += p;
    if (!NIET_LIFETIME.has(r.kind)) lifetime += p;
    if (t0 !== null && new Date(r.created_at).getTime() >= t0 && !NIET_KLASSEMENT.has(r.kind)) klassement += p;
  }
  return { lifetime: Math.max(0, lifetime), saldo, klassement };
}

// ---------------------------------------------------------------------------------------------------------------
// Niveaus
// ---------------------------------------------------------------------------------------------------------------
export const NIVEAUS = [
  { id: "starter", naam: "Starter", vanaf: 0 },
  { id: "regular", naam: "Regular", vanaf: 250 },
  { id: "vaste_klant", naam: "Vaste klant", vanaf: 750 },
  { id: "fittiner", naam: "Fittin'er", vanaf: 1500 },
  { id: "legende", naam: "Legende", vanaf: 3000 },
];
// Vanaf dit niveau: +10 % op alles wat je verdient.
export const PERK_NIVEAU = "vaste_klant";
export const PERK_PCT = 10;

export function niveauVan(lifetime) {
  let i = 0;
  for (let k = 0; k < NIVEAUS.length; k++) if (lifetime >= NIVEAUS[k].vanaf) i = k;
  const nu = NIVEAUS[i];
  const volgend = NIVEAUS[i + 1] || null;
  const pct = volgend ? Math.min(100, Math.round(((lifetime - nu.vanaf) / (volgend.vanaf - nu.vanaf)) * 100)) : 100;
  return { ...nu, index: i, volgend, nogNodig: volgend ? volgend.vanaf - lifetime : 0, pct };
}

export function factor(lifetime) {
  const perk = NIVEAUS.find((n) => n.id === PERK_NIVEAU);
  return lifetime >= perk.vanaf ? 1 + PERK_PCT / 100 : 1;
}

// Wat een verdienmoment écht oplevert: basiswaarde × (rustig uur) × (niveau-perk), afgerond.
export function bereken(basis, { lifetime = 0, rustig = false, settings = null } = {}) {
  const r = rustig ? waarde(settings, "rustig_factor") || 1 : 1;
  return Math.round(basis * r * factor(lifetime));
}

// ---------------------------------------------------------------------------------------------------------------
// Tijd — ISO-weken in Brussel
// ---------------------------------------------------------------------------------------------------------------
const BXL = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" });
export const dagBxl = (iso) => BXL.format(new Date(iso)); // "2026-09-18"

export function isoWeek(iso) {
  const [y, m, d] = dagBxl(iso).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dag);
  const jaar = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(jaar, 0, 1)) / 86400000 + 1) / 7);
  return `${jaar}-W${String(week).padStart(2, "0")}`;
}

// De maandag van de ISO-week als datum-string, en de vorige week.
export function vorigeWeek(weekKey) {
  const [j, w] = weekKey.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(j, 0, 4));
  const maandag = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (w - 1) * 7 * 86400000);
  return isoWeek(new Date(maandag.getTime() - 3 * 86400000).toISOString());
}

/**
 * De reeks weken-op-rij, met pauzeweken.
 * @param {Set<string>} gehaald  weken waarin het weekdoel gehaald werd
 * @param {string} laatsteWeek  de laatst AFGESLOTEN week (de lopende telt niet: die kan nog gehaald worden)
 * @returns {{lengte:number, pauzes:string[]}}
 *
 * Een gemiste week breekt de reeks, tenzij er in de 8 weken ervoor nog geen pauze gebruikt werd: dan telt ze als
 * pauzeweek (vakantie, ziekte). Een pauze verlengt de reeks niet, ze onderbreekt ze alleen niet.
 */
export function reeks(gehaald, laatsteWeek, { pauzePer = 8, maxTerug = 104 } = {}) {
  let w = laatsteWeek, lengte = 0, sindsPauze = Infinity;
  const pauzes = [];
  for (let i = 0; i < maxTerug; i++) {
    if (gehaald.has(w)) { lengte++; sindsPauze++; w = vorigeWeek(w); continue; }
    // Gemist: een pauze mag als er in de 8 weken ervoor (terug in de tijd) geen andere viel, en als de week
    // ervoor wél gehaald is — een reeks begint dus nooit met een pauze.
    if (sindsPauze >= pauzePer && gehaald.has(vorigeWeek(w))) { pauzes.push(w); sindsPauze = 0; w = vorigeWeek(w); continue; }
    break;
  }
  return { lengte, pauzes };
}

// ---------------------------------------------------------------------------------------------------------------
// Starter-quest
// ---------------------------------------------------------------------------------------------------------------
export const QUEST = [
  { id: "profiel", l: "Vul je profiel aan (doel en weekdoel)", key: "quest_profiel" },
  { id: "boek", l: "Boek je eerste sessie", key: "quest_boek" },
  { id: "eerste", l: "Kom je eerste sessie trainen", key: "quest_eerste" },
  { id: "tweede", l: "Een tweede sessie binnen 14 dagen", key: "quest_tweede" },
  { id: "derde", l: "Een derde sessie binnen 30 dagen", key: "quest_derde" },
  { id: "bron", l: "Vertel hoe je ons vond", key: "quest_bron" },
];

/**
 * Welke queststappen zijn gehaald, en welke leveren punten op?
 * @param sessies  voltooide sessies van het lid (starts_at oplopend), eigen of als deelnemer
 * @param geboekt  heeft het lid ooit een (niet-geannuleerde) boeking gemaakt
 * @param profiel  { coaching_doel, streak_target_gezet, hoe_gevonden }
 * @param gestartOp  lanceringsmoment: wat daarvoor gebeurde, is gehaald maar levert niets op
 */
export function questStatus({ sessies = [], geboektOp = null, profielOp = null, bronOp = null, gestartOp }) {
  const g = new Date(gestartOp).getTime();
  const t = (x) => (x ? new Date(x).getTime() : null);
  const eerste = sessies[0]?.starts_at || null;
  const stap = {};
  stap.profiel = profielOp;
  stap.boek = geboektOp;
  stap.eerste = eerste;
  const binnen = (n, dagen) => {
    const s = sessies[n - 1];
    if (!s || !eerste) return null;
    return t(s.starts_at) - t(eerste) <= dagen * 86400000 ? s.starts_at : null;
  };
  stap.tweede = binnen(2, 14);
  stap.derde = binnen(3, 30);
  stap.bron = eerste ? bronOp : null;
  return QUEST.map((q) => {
    const op = stap[q.id];
    return { ...q, gehaald: !!op, punten: !!op && t(op) >= g, op };
  });
}

// Het lid is "gestart" na de derde sessie: vanaf dan verdwijnt de quest en verschijnen niveau en klassement.
export const isGestart = (aantalSessies) => aantalSessies >= 3;

// ---------------------------------------------------------------------------------------------------------------
// Rustige uren
// ---------------------------------------------------------------------------------------------------------------
/**
 * Klasse van een uur-van-de-week op basis van de laatste 8 weken.
 * @param weeksBooked  in hoeveel van de 8 weken dit uur geboekt werd
 */
export function klasseVan(weeksBooked, { rustigMax = 2, drukMin = 5 } = {}) {
  if (weeksBooked >= drukMin) return "druk";
  if (weeksBooked <= rustigMax) return "rustig";
  return "normaal";
}

/**
 * Dezelfde regel als public.slot_promo(), voor het rooster. De databank beslist; dit toont het vooraf.
 * @param demand  { klasse, pin } of null
 */
export function promoVoor(demand, startMs, nuMs, { aan = true } = {}) {
  if (!aan) return null;
  if (demand?.pin === "nooit") return null;
  if (demand?.pin === "altijd") return "rustig";
  if (demand?.klasse === "druk") return null;
  if (demand?.klasse === "rustig") return "rustig";
  if (startMs > nuMs && startMs - nuMs <= 24 * 3600000) return "rustig";
  return null;
}

// 2 uur voor de prijs van 1: vanaf 2 uur valt er één uur weg.
export const betaaldeUren = (uren, promo) => (promo === "rustig" && uren >= 2 ? uren - 1 : uren);

// dow/uur van een moment in Brussel (ISO-dag: 1 = maandag).
const DOW_UUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", weekday: "short", hour: "2-digit", hour12: false });
export function dowUur(iso) {
  const p = DOW_UUR.formatToParts(new Date(iso));
  const dag = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.find((x) => x.type === "weekday")?.value];
  let uur = Number(p.find((x) => x.type === "hour")?.value);
  if (uur === 24) uur = 0;
  return { dow: dag, hour: uur };
}

// ---------------------------------------------------------------------------------------------------------------
// Klassement
// ---------------------------------------------------------------------------------------------------------------
/**
 * @param perLid  Map userId → { naam, deze, vorige, sessies, aangebracht }
 * @returns { top, verbeterd, aanbrenger }
 */
export function klassement(perLid, { minSessiesVerbeterd = 4 } = {}) {
  const rij = [...perLid.entries()].map(([id, x]) => ({ id, ...x }));
  const top = rij.filter((x) => x.deze > 0).sort((a, b) => b.deze - a.deze || a.naam.localeCompare(b.naam));
  const verbeterd = rij
    .filter((x) => (x.sessies || 0) >= minSessiesVerbeterd && x.deze > (x.vorige || 0))
    .sort((a, b) => b.deze - (b.vorige || 0) - (a.deze - (a.vorige || 0)))[0] || null;
  const aanbrenger = rij.filter((x) => (x.aangebracht || 0) > 0).sort((a, b) => b.aangebracht - a.aangebracht)[0] || null;
  return { top, verbeterd, aanbrenger };
}

// Het gymdoel van deze maand: 110 % van vorige maand, afgerond op 5, minstens 20.
export const gymdoel = (vorigeMaand) => Math.max(20, Math.round((vorigeMaand * 1.1) / 5) * 5);
