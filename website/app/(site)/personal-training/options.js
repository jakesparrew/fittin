// Gedeeld tussen het intakeformulier (client) en de server-action: een "use server"-bestand mag
// alleen async functies exporteren, dus deze lijsten kunnen daar niet in staan.
export const FORMULES = ["1-op-1", "1-op-2 (duo)", "1-op-3 (kleine groep)", "Weet ik nog niet"];

// Beschikbaarheid — de twee vragen waarmee de beheerder ziet aan wie een aanvraag toegewezen kan
// worden. Vroeger stond hier één vrij tekstveld; de antwoorden waren bruikbaar ("Ma, dinsdag &
// donderdag na 18u") maar onvergelijkbaar tussen aanvragen.
//
// Dagdeel is bewust ÉÉN keuze (radio), geen twee vinkjes: "Maakt niet uit" ís het antwoord
// "overdag én 's avonds". Drie radio's dekken dus alle zinvolle combinaties, kosten altijd precies
// één tik, en kunnen nooit tegenstrijdig zijn.
export const DAGDELEN = [
  { v: "overdag", l: "Overdag", zin: "overdag" },
  { v: "avond", l: "'s Avonds", zin: "'s avonds" },
  // Kort houden: de drie chips delen één rij in drie gelijke kolommen. "Maakt niet uit" wikkelde
  // daarin naar twee regels en maakte die ene chip 58 px hoog tegen 41 px voor de andere twee.
  { v: "flexibel", l: "Allebei", zin: "overdag of 's avonds" },
];

export const DAGEN = [
  { v: "ma", l: "Ma", week: true },
  { v: "di", l: "Di", week: true },
  { v: "wo", l: "Wo", week: true },
  { v: "do", l: "Do", week: true },
  { v: "vr", l: "Vr", week: true },
  { v: "za", l: "Za", week: false },
  { v: "zo", l: "Zo", week: false },
];

// De enige plek waar de rauwe formulierwaarden betekenis krijgen — dus ook de enige plek waar de
// validatie hoort. Door over de CONSTANTE te filteren i.p.v. over de invoer is alles in één keer
// afgedekt: onbekende waarden vallen weg, duplicaten vallen weg, er komen er nooit meer dan zeven
// uit, en de volgorde is altijd ma→zo (nooit "zo, ma") ook als iemand zelf een POST samenstelt.
// Een checkbox heeft geen maxLength, dus dit IS de enige poort. De uitvoer bestaat uitsluitend uit
// de constanten hierboven — geen enkel teken komt van de bezoeker. Daarom is deze string veilig in
// een mailonderwerp; het vrije `when`-veld is dat niet.
export function beschikbaarheidZin(dagdeelRaw, dagenRaw) {
  const dd = DAGDELEN.find((d) => d.v === String(dagdeelRaw || "").trim());
  const binnen = (Array.isArray(dagenRaw) ? dagenRaw : []).slice(0, 40).map((d) => String(d).trim());
  const dagen = DAGEN.filter((d) => binnen.includes(d.v));
  const welke =
    dagen.length === 0 ? ""
      : dagen.length === DAGEN.length ? "elke dag"
      : dagen.length === 5 && dagen.every((d) => d.week) ? "weekdagen"
      : dagen.length === 2 && dagen.every((d) => !d.week) ? "in het weekend"
      : dagen.map((d) => d.v).join(", ");
  return [dd ? dd.zin : "", welke].filter(Boolean).join(" · ");
}
