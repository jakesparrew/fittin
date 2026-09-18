// Badges — regels op statistieken van één lid, zonder databank (getest in lib/badges.test.js).
//
// Een badge wordt één keer verdiend en nooit afgenomen. De punten erbij komen als 'badge'-rij in het puntenboek.
// De statistieken (`st`) worden door de puntencron samengesteld uit voltooide sessies NA de lancering én ervoor:
// een badge is erkenning, geen munt — wie al 50 keer kwam, krijgt de 50-badge meteen (zonder de punten).

export const BADGES = [
  { id: "sessie_1", l: "Eerste sessie", e: "🌱", punten: 10, uitleg: "Je eerste sessie bij Fittin'", regel: (st) => st.sessies >= 1 },
  { id: "sessie_10", l: "10 sessies", e: "💪", punten: 20, uitleg: "10 sessies getraind", regel: (st) => st.sessies >= 10 },
  { id: "sessie_25", l: "25 sessies", e: "🏅", punten: 30, uitleg: "25 sessies getraind", regel: (st) => st.sessies >= 25 },
  { id: "sessie_50", l: "50 sessies", e: "🥈", punten: 40, uitleg: "50 sessies getraind", regel: (st) => st.sessies >= 50 },
  { id: "sessie_100", l: "100 sessies", e: "🥇", punten: 50, uitleg: "100 sessies getraind", regel: (st) => st.sessies >= 100 },
  { id: "vroege_vogel", l: "Vroege vogel", e: "🌅", punten: 15, uitleg: "5 sessies die vóór 08:00 begonnen", regel: (st) => st.vroeg >= 5 },
  { id: "nachtuil", l: "Nachtuil", e: "🦉", punten: 15, uitleg: "5 sessies die om 21:00 of later begonnen", regel: (st) => st.laat >= 5 },
  { id: "rustig_held", l: "Rustige-urenheld", e: "⚡", punten: 20, uitleg: "10 sessies op een rustig uur", regel: (st) => st.rustig >= 10 },
  { id: "reeks_4", l: "4 weken op rij", e: "🔥", punten: 15, uitleg: "4 weken na elkaar je weekdoel gehaald", regel: (st) => st.reeksMax >= 4 },
  { id: "reeks_12", l: "12 weken op rij", e: "🔥", punten: 30, uitleg: "12 weken na elkaar je weekdoel gehaald", regel: (st) => st.reeksMax >= 12 },
  { id: "reeks_26", l: "Half jaar op rij", e: "☄️", punten: 50, uitleg: "26 weken na elkaar je weekdoel gehaald", regel: (st) => st.reeksMax >= 26 },
  { id: "zaalwachter", l: "Zaalwachter", e: "🧼", punten: 20, uitleg: "10 zaalchecks gedaan", regel: (st) => st.zaalchecks >= 10 },
  { id: "oog_voor_detail", l: "Oog voor detail", e: "🔎", punten: 20, uitleg: "3 zaalchecks met een foto die Fittin' nuttig vond", regel: (st) => st.nuttigeFotos >= 3 },
  { id: "buddy", l: "Buddy", e: "🤝", punten: 20, uitleg: "3 verschillende mensen meegebracht", regel: (st) => st.gasten >= 3 },
  { id: "ambassadeur_1", l: "Ambassadeur", e: "📣", punten: 20, uitleg: "Een vriend meegebracht die zelf klant werd", regel: (st) => st.omgezet >= 1 },
  { id: "ambassadeur_3", l: "Ambassadeur ★★★", e: "🎖️", punten: 30, uitleg: "3 vrienden die klant werden — met een gratis sessie", regel: (st) => st.omgezet >= 3 },
  { id: "ambassadeur_5", l: "Fittin'-ambassadeur", e: "👑", punten: 50, uitleg: "5 vrienden die klant werden — met nog een gratis sessie", regel: (st) => st.omgezet >= 5 },
  { id: "logboek", l: "Logboek", e: "📝", punten: 20, uitleg: "20 trainingen gelogd", regel: (st) => st.logs >= 20 },
  { id: "plan_af", l: "Plan afgewerkt", e: "🏁", punten: 30, uitleg: "Een trainingsplan tot het einde gevolgd", regel: (st) => st.plansAf >= 1 },
];
export const BADGE = Object.fromEntries(BADGES.map((b) => [b.id, b]));

// Ambassadeur ★★★ en 👑 geven ook een gratis sessie (uit het aanbrengbudget, niet uit het gewone plafond).
export const BADGE_MET_SESSIE = new Set(["ambassadeur_3", "ambassadeur_5"]);

const LEEG = { sessies: 0, vroeg: 0, laat: 0, rustig: 0, reeksMax: 0, zaalchecks: 0, nuttigeFotos: 0, gasten: 0, omgezet: 0, logs: 0, plansAf: 0 };

/** Welke badges verdient dit lid nu, die het nog niet had? */
export function nieuweBadges(stats, al = new Set()) {
  const st = { ...LEEG, ...stats };
  return BADGES.filter((b) => !al.has(b.id) && b.regel(st)).map((b) => b.id);
}

/** De badge die het dichtst bij is, voor "nog 2 sessies voor …". Enkel tellers met een duidelijk doel. */
export function volgendeBadge(stats, al = new Set()) {
  const st = { ...LEEG, ...stats };
  const doelen = [
    ["sessie_10", st.sessies, 10, "sessies"], ["sessie_25", st.sessies, 25, "sessies"], ["sessie_50", st.sessies, 50, "sessies"],
    ["sessie_100", st.sessies, 100, "sessies"], ["zaalwachter", st.zaalchecks, 10, "zaalchecks"], ["rustig_held", st.rustig, 10, "sessies op een rustig uur"],
    ["logboek", st.logs, 20, "gelogde trainingen"],
  ];
  const open = doelen.filter(([id, nu, doel]) => !al.has(id) && nu < doel).map(([id, nu, doel, wat]) => ({ id, nog: doel - nu, wat, pct: nu / doel }));
  open.sort((a, b) => b.pct - a.pct);
  if (!open[0]) return null;
  const { l, e, punten } = BADGE[open[0].id];
  return { ...open[0], badge: { l, e, punten } }; // zonder de regel-functie: dit gaat ook naar clientcomponenten
}

/** Statistieken uit ruwe rijen — voltooide sessies met hun startuur en promo. */
const UUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false });
export function sessieStats(sessies) {
  let vroeg = 0, laat = 0, rustig = 0;
  for (const s of sessies || []) {
    const u = Number(UUR.format(new Date(s.starts_at))) % 24;
    if (u < 8) vroeg++;
    if (u >= 21) laat++;
    if (s.promo === "rustig") rustig++;
  }
  return { sessies: (sessies || []).length, vroeg, laat, rustig };
}
