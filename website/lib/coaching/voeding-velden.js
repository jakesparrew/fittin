// De keuzelijst voor voedingsvoorkeuren, apart van `maaltijd.js`.
//
// Waarom een eigen bestand: het maaltijdscherm is een client component, en `maaltijd.js` sleept via
// zijn imports het model, het budget en de databank mee. Eén lijstje labels hoort niet de halve
// serverkant naar de browser te trekken. Dezelfde reden als `lib/aanmelding-velden.js`.

export const VOEDINGSVOORKEUREN = [
  { v: "vegetarisch", l: "Vegetarisch" },
  { v: "geen-varken", l: "Geen varkensvlees" },
  { v: "geen-vis", l: "Geen vis" },
  { v: "lactosevrij", l: "Lactosevrij" },
  { v: "glutenvrij", l: "Glutenvrij" },
  { v: "noten", l: "Geen noten" },
];
