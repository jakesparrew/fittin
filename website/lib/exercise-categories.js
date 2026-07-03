// Exercise-category metadata for the SEO hub pages. Keyed on the exact `category` field stored on
// exercises (borst, rug, schouders, benen, armen, core). Unknown categories fall back gracefully.

const MAP = {
  borst: {
    label: "Borst",
    title: "Borstoefeningen",
    intro: "Alle borstoefeningen op een rij — van bankdrukken tot push-ups. Bekijk per oefening de correcte uitvoering, de doelspieren en stap-voor-stap uitleg, en stel er je eigen borsttraining mee samen.",
  },
  rug: {
    label: "Rug",
    title: "Rugoefeningen",
    intro: "Bouw een sterke, brede rug met deze oefeningen — roeien, pulldowns, pull-ups en meer. Elke oefening met demo, doelspieren en duidelijke instructies.",
  },
  schouders: {
    label: "Schouders",
    title: "Schouderoefeningen",
    intro: "Sterke, stabiele schouders train je met deze oefeningen — van overhead press tot lateral raises. Bekijk de uitvoering en doelspieren per oefening.",
  },
  benen: {
    label: "Benen",
    title: "Beenoefeningen",
    intro: "De belangrijkste beenoefeningen — squats, leg press, deadlifts en meer. Correcte techniek, doelspieren en uitleg voor elke oefening.",
  },
  armen: {
    label: "Armen",
    title: "Armoefeningen",
    intro: "Train je biceps en triceps gericht met deze armoefeningen — curls, dips, pushdowns en meer. Bekijk per oefening de juiste uitvoering.",
  },
  core: {
    label: "Core",
    title: "Core-oefeningen",
    intro: "Een sterke core is de basis van elke beweging. Deze oefeningen — planks, twists, ab wheel — train je buik- en rompspieren met correcte techniek.",
  },
};

export const catLabel = (cat) => MAP[cat]?.label || (cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "Oefeningen");
export const catTitle = (cat) => MAP[cat]?.title || `${catLabel(cat)}oefeningen`;
export const catIntro = (cat) =>
  MAP[cat]?.intro ||
  `Alle ${catLabel(cat).toLowerCase()}oefeningen op een rij, met demo, doelspieren en stap-voor-stap uitleg. Stel er je eigen training mee samen.`;
