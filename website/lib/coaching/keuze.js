// Van "een samengestelde beenoefening" naar een echte oefening uit de bibliotheek.
//
// Dit is het scharnier van het hele ontwerp. Het model bedenkt de STRUCTUUR van een sessie — welk
// soort oefening, hoeveel sets, hoeveel herhalingen, hoeveel rust — maar kiest nooit zelf een
// oefening. Dat doet deze code, uit de 886 rijen die echt in de databank staan.
//
// Waarom zo:
//   * Een taalmodel dat oefeningnamen mag noemen, verzint er vroeg of laat een. Dan staat het lid
//     in de zaal met een naam die nergens op slaat en zonder video. Hier is dat onmogelijk: wat
//     niet in de bibliotheek staat, kan niet gekozen worden.
//   * De bibliotheek in de prompt stoppen kost duizenden tokens per aanroep. Zo blijft de prompt
//     klein en de rekening laag.
//   * En het belangrijkste: als de invulling code is, kan een VOLGENDE week zonder model gemaakt
//     worden. Alleen het plan en de weekzin hebben er nog een nodig.
//
// Alles hier is puur: geen databank, geen klok. De bibliotheek komt als gewone lijst binnen.

/** Categorieën zoals ze echt in de databank staan (886 rijen, geteld 10-09-2026). */
export const CATEGORIEEN = ["benen", "armen", "schouders", "rug", "core", "borst"];

/** Niveau van het lid → welke moeilijkheidsgraden mogen meedoen. */
const NIVEAUS = {
  nooit: ["beginner"],
  soms: ["beginner", "intermediate"],
  vaak: ["beginner", "intermediate", "gevorderd"],
};

/**
 * Een kleine, stabiele hasher. Twee redenen dat hier geen Math.random() staat: de keuze moet
 * herhaalbaar zijn (dezelfde week opnieuw opbouwen mag niet plots andere oefeningen geven), en
 * random tijdens het renderen is precies het patroon dat in dit project hydratatiefouten gaf.
 */
export function zaadUit(tekst) {
  let h = 2166136261;
  for (let i = 0; i < String(tekst).length; i++) {
    h ^= String(tekst).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// De basisoefeningen. Van de 886 rijen in de bibliotheek is het merendeel een obscure variant —
// "Seated One-Arm Dumbbell Palms-Up Wrist Curl" staat er even goed in als "Squat". Zonder deze lijst
// wint de obscure variant even vaak, want bij gelijke score besliste enkel het zaad. Dat is precies
// wat er bij de eerste echte generatie gebeurde: een plyometrische warming-up ("Double Leg Butt
// Kick") kwam als hoofdoefening benen op 4×6 met twee minuten rust te staan.
//
// Geen ranglijst van "beste" oefeningen, wel een herkenbaarheidsfilter: een lid dat alleen in de
// zaal staat, moet de naam kennen of minstens meteen begrijpen wat er van hem gevraagd wordt.
// Twee lijsten, want de rol van een oefening bepaalt of ze past. Eén gezamenlijke lijst gaf
// "Incline Dumbbell Flyes" als hoofdoefening borst op 4×6 — flyes zijn geen zware
// zesherhalingenoefening, maar "fly" stond tussen de basisbewegingen en kreeg dezelfde bonus als
// "bench press".
const ZWAARWERK = [
  "squat", "deadlift", "bench press", "bankdruk", "overhead press", "shoulder press", "row",
  "pull-up", "pullup", "chin-up", "pulldown", "lunge", "leg press", "hip thrust", "romanian",
  "push-up", "pushup", "dip", "press",
];
const BIJWERK = [
  "curl", "triceps", "calf raise", "lateral raise", "face pull", "plank", "crunch", "fly",
  "pullover", "shrug", "hyperextension", "leg extension", "leg curl", "raise", "extension",
];

// De kern. Trefwoorden alleen volstonden niet: "squat" gaf evenveel bonus aan "Jefferson Squats"
// als aan "Barbell Squat", en "press" aan "Floor Press with Chains". Van de 886 rijen is het
// merendeel een variant van een variant; dit zijn de oefeningen die een lid herkent en die een
// coach effectief voorschrijft.
//
// PER CATEGORIE, en dat is geen opmaak. De lijst was eerst vlak, en `bevat()` kijkt alleen naar de
// naam — dus ving "upright row" (hier bedoeld als SCHOUDER-oefening) de bonus van 25 punten op een
// rij die in de databank als `rug` staat. Gevolg: op de Pull-dag stond "Smith Machine Upright Row"
// met 57 punten gelijk met "Bent Over Barbell Row" en "One-Arm Dumbbell Row", en besliste het zaad.
// Gemeten op het echte plan van 11-09: het zaad koos de upright row, en die Pull-dag bevatte geen
// enkele trekbeweging.
//
// Alle namen zijn op 10-09-2026 tegen de echte bibliotheek gecontroleerd en bestaan daar. Ze staan
// hier als NAAM en niet als id: ids verschillen per gym, en dit project is multi-tenant bedoeld.
// Verdwijnt er ooit een, dan zakt hij gewoon terug naar de gewone score — geen crash, alleen een
// iets minder herkenbare keuze. `lib/coaching/keuze.test.js` bewaakt dat de lijst niet leegloopt.
export const KERNOEFENINGEN = {
  benen: [
    "barbell squat", "front squat", "leg press", "barbell lunge", "romanian deadlift",
    "leg extensions", "leg curl", "standing calf raises", "bodyweight squat", "glute bridge",
    "mountain climbers",
  ],
  borst: [
    "barbell bench press", "dumbbell bench press", "incline dumbbell press", "pushups", "butterfly",
    "cable crossover", "dips - chest version",
  ],
  rug: [
    "barbell deadlift", "pullups", "wide-grip lat pulldown", "bent over barbell row",
    "seated cable rows", "one-arm dumbbell row", "hyperextensions", "dumbbell shrug",
  ],
  schouders: [
    "barbell shoulder press", "dumbbell shoulder press", "side lateral raise",
    "front dumbbell raise", "face pull", "upright row",
  ],
  armen: [
    "barbell curl", "dumbbell bicep curl", "hammer curls", "triceps pushdown",
    "lying triceps press", "dips - triceps version",
  ],
  core: ["crunches", "plank", "russian twist", "hanging leg raise", "cable crunch"],
};

// ---------------------------------------------------------------------------
// Bewegingspatronen
// ---------------------------------------------------------------------------
//
// WAAROM DIT ERBIJ MOEST. De score kende tot nu alleen SPIERGROEP (rug, benen, borst...) en
// `mechanic` (compound/isolation). Dat volstaat niet: "rug" is geen beweging. Een week kon dus
// netjes rug afvinken zonder dat het lid één keer getrokken had — gemeten op het echte plan van
// 11-09, waar de Pull-dag bestond uit een shrug, een upright row en een hyperextensie.
//
// Een patroon zegt wat het LICHAAM doet, en dat is wat een week moet dekken. De databank heeft er
// al een half veld voor (`force`: push/pull/static), maar dat scheidt hurken niet van drukken en
// roeien niet van optrekken. Vandaar deze zes, op naam herkend.
export const PATRONEN = ["hurk", "scharnier", "duw_horizontaal", "duw_verticaal", "trek_horizontaal", "trek_verticaal"];

const PATROON_WOORDEN = [
  // Volgorde telt: de eerste die matcht wint. "romanian deadlift" moet scharnier worden en niet
  // hurk, "upright row" moet géén trekpatroon worden.
  // "leg curl" hoort hier NIET: dat is kniebuiging, geen heupscharnier. Stond hij er wel, dan zou
  // een dag met een leg curl daarna een deadlift wegstraffen als "alweer hetzelfde patroon".
  ["scharnier", ["deadlift", "romanian", "good morning", "hip thrust", "glute bridge", "back extension", "hyperextension", "kettlebell swing"]],
  ["hurk", ["squat", "leg press", "lunge", "step-up", "step up", "split squat", "hack", "sissy"]],
  ["trek_verticaal", ["pull-up", "pullup", "chin-up", "chinup", "pulldown", "lat pull"]],
  ["trek_horizontaal", ["row", "seated cable row", "inverted row", "face pull"]],
  ["duw_verticaal", ["shoulder press", "overhead press", "military press", "arnold press", "push press"]],
  ["duw_horizontaal", ["bench press", "chest press", "push-up", "pushup", "dip", "floor press", "fly", "crossover", "butterfly"]],
];

// Uitzonderingen die de trefwoorden niet vangen. "Upright row" bevat "row" maar is een
// schouderbeweging, geen trekpatroon voor de rug — precies de verwarring die de Pull-dag sloopte.
// "Shrug" idem: dat is de trapezius optrekken, geen roeibeweging.
const GEEN_PATROON = ["upright row", "shrug"];

/**
 * Welk bewegingspatroon is dit? Null wanneer het een isolatie of iets anders is — de meeste rijen
 * in de bibliotheek hebben geen patroon, en dat hoort ook niet.
 */
export function patroonVan(oef) {
  const n = kaal(oef?.name);
  if (!n) return null;
  if (GEEN_PATROON.some((w) => n.includes(kaal(w)))) return null;
  for (const [patroon, woorden] of PATROON_WOORDEN) {
    if (woorden.some((w) => n.includes(kaal(w)))) return patroon;
  }
  return null;
}

/**
 * Welk patroon hoort de HOOFDOEFENING van deze categorie te zijn? Dit is de regel die een "Pull"-dag
 * dwingt om echt te trekken. Voor categorieën zonder natuurlijk zwaar patroon (armen, core) geldt
 * geen eis — daar is de hoofdoefening per definitie bijwerk.
 */
export const HOOFDPATROON = {
  benen: ["hurk", "scharnier"],
  rug: ["trek_horizontaal", "trek_verticaal"],
  borst: ["duw_horizontaal"],
  schouders: ["duw_verticaal"],
};

// Bewegingen die per definitie explosief of technisch zijn. Prima voor wie ervaring heeft, maar
// nooit als opwarming en nooit voor een beginner.
const EXPLOSIEF = ["clean", "snatch", "jerk", "jump", "butt kick", "burpee", "box jump", "kip", "swing"];

// Materiaal dat een gewone krachtsessie draagt. "Overig", foam roller en fitnessbal zijn nuttig,
// maar horen niet als hoofdoefening.
const HOOFDMATERIAAL = ["Barbell", "Dumbbell", "Machine", "Cable", "EZ-bar", "Lichaamsgewicht", "Kettlebells"];

// Naam en zoekwoord allebei terugbrengen tot enkel letters. Zo matcht "Leg Press" ook op
// "Legpress", "Leg-Press" en "LEG PRESS" — de bibliotheek is met de hand en uit een import
// gevuld, en die schrijfwijzen staan er allemaal in.
const kaal = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const bevat = (naam, lijst) => {
  const n = kaal(naam);
  return lijst.some((w) => n.includes(kaal(w)));
};

/**
 * Hoe goed past deze oefening bij dit blok? Hoger is beter. Geen willekeur in de score zelf —
 * die komt pas bij gelijkspel, en dan uit het zaad.
 */
export function score(oef, blok, { niveau = "soms", materiaal = null } = {}) {
  // Categorie is de enige harde eis. Wie een beenoefening vraagt, krijgt geen bicepscurl.
  if (blok.categorie && oef.category !== blok.categorie) return -1;

  const toegestaan = NIVEAUS[niveau] || NIVEAUS.soms;
  if (oef.difficulty && !toegestaan.includes(oef.difficulty)) return -1;

  // Materiaal dat de zaal niet heeft, kan niet. Is de lijst leeg of onbekend, dan laten we alles
  // toe — liever een oefening te veel dan een lege sessie.
  if (Array.isArray(materiaal) && materiaal.length && oef.equipment && !materiaal.includes(oef.equipment)) return -1;

  let s = 0;
  // Een demo is geen sier: het lid staat alleen in de zaal en heeft niemand om het aan te vragen.
  if (oef.animation_url) s += 6;
  else if (oef.image_url) s += 4;
  if (Array.isArray(oef.instructions) && oef.instructions.length) s += 2;

  // Samengesteld of isolatie zoals gevraagd. Geen eis maar een sterke voorkeur: de bibliotheek
  // heeft 109 rijen zonder `mechanic`, en die mogen niet allemaal wegvallen.
  if (blok.mechanic && oef.mechanic === blok.mechanic) s += 5;
  else if (blok.mechanic && oef.mechanic) s -= 3;

  if (blok.force && oef.force === blok.force) s += 2;

  // Een beginner heeft meer aan een beginneroefening dan aan de zwaarste die hij mag doen.
  if (niveau === "nooit" && oef.difficulty === "beginner") s += 3;
  if (niveau === "vaak" && oef.difficulty === "gevorderd") s += 1;

  // ---- Herkenbaarheid, en of de beweging bij de ROL van dit blok past ----
  // Zonder dit wint een obscure variant even vaak als een basisoefening, en komt bijwerk op de
  // plaats van zwaar werk terecht.
  // Een kernoefening wint van elke variant. Dit is de zwaarste bonus in de hele score, en met
  // opzet: liever tien keer "Barbell Squat" dan één keer "Jefferson Squats".
  //
  // Behalve in de opwarming. Daar zegt "dit is een kernoefening" niets over of ze past — "Pullups"
  // is een uitstekende hoofdoefening en een belabberde opwarming. Anders wint de kernbonus het van
  // de opwarmingsregel en staat er weer twaalf pull-ups als eerste blok.
  // De kernbonus geldt alleen binnen de EIGEN categorie. Vlak toegepast ving "upright row" (bedoeld
  // als schouderoefening) 25 punten op een rij die als `rug` getagd staat.
  const kern = KERNOEFENINGEN[oef.category] || [];
  if (bevat(oef.name, kern)) s += blok.sectie === "Warming-up" ? 6 : 25;

  const zwaar = bevat(oef.name, ZWAARWERK);
  const bij = bevat(oef.name, BIJWERK);
  const hoofd = blok.sectie === "Hoofdoefening";
  const opwarming = blok.sectie === "Warming-up";
  // Zwaar werk hoort in de hoofdoefening, mag als accessoire, en NOOIT als opwarming — ook niet
  // als de bibliotheek het als "beginner" bestempelt. Zo stond "Pullups" hier als opwarming van
  // twaalf herhalingen, puur omdat die rij op beginner staat.
  if (zwaar) s += hoofd ? 14 : opwarming ? -10 : 8;
  if (bij) s += hoofd ? -6 : 12;

  // Een lange naam is bijna altijd een variant van een variant ("Seated One-Arm Dumbbell Palms-Up
  // Wrist Curl"). Niet verbieden, wel achteraan zetten.
  const lengte = String(oef.name || "").length;
  if (lengte > 34) s -= 6;
  else if (lengte > 26) s -= 2;

  if (oef.equipment && !HOOFDMATERIAAL.includes(oef.equipment)) s -= 4;

  // Rug betekent trekken, op élke plek in de sessie en niet alleen als hoofdoefening. Zonder deze
  // regel won een shrug of een hyperextensie van een roeibeweging zodra `rug` maar een accessoire
  // was — en bij een plan van twee dagen is dat de enige plek waar rug voorkomt. Gemeten: dat plan
  // bevatte dan geen enkele trekbeweging.
  // Staat er al een trekpatroon in deze sessie, dan haalt de spreidingsstraf dit weer weg — en dan
  // wint de hyperextensie alsnog, wat dan ook de bedoeling is.
  // NIET in de opwarming: daar zou deze bonus een pull-up naar voren trekken, en een opwarming van
  // twaalf pull-ups is geen opwarming. Er staat een test op die dat bewaakt.
  if (oef.category === "rug" && blok.sectie !== "Warming-up") {
    const p = patroonVan(oef);
    if (p === "trek_horizontaal" || p === "trek_verticaal") s += 8;
  }

  // ---- Explosief werk hoort niet overal ----
  const isExplosief = bevat(oef.name, EXPLOSIEF);
  if (isExplosief) {
    // Nooit als opwarming: dat is precies omgekeerd aan waarvoor een opwarming dient.
    if (blok.sectie === "Warming-up") return -1;
    if (niveau === "nooit") return -1;
    if (niveau === "soms") s -= 8;
  }

  // ---- De opwarming zelf ----
  if (blok.sectie === "Warming-up") {
    // Licht en zonder stang. Een opwarming met een barbell is geen opwarming.
    if (oef.equipment === "Lichaamsgewicht") s += 8;
    if (oef.equipment === "Barbell") s -= 8;
    // En vooral: makkelijk. "Pullups" is eigen lichaamsgewicht maar geen opwarming — daar begin
    // je een sessie niet mee, zeker niet met twaalf herhalingen.
    if (oef.difficulty === "beginner") s += 8;
    if (oef.difficulty === "intermediate") s -= 4;
    if (oef.difficulty === "gevorderd") s -= 12;
  }

  // ---- De hoofdoefening ----
  if (blok.sectie === "Hoofdoefening") {
    // Hier hoort het zware werk: samengesteld, met materiaal dat je kan verzwaren.
    if (oef.mechanic === "isolation") s -= 6;
    if (oef.equipment === "Barbell" || oef.equipment === "Dumbbell" || oef.equipment === "Machine") s += 4;

    // En het moet de JUISTE BEWEGING zijn. Zonder deze regel kan een "Pull"-dag een shrug of een
    // upright row als hoofdoefening krijgen: allebei `rug`, allebei compound, allebei zonder één
    // trekbeweging erin. Een spiergroep is geen beweging.
    const gevraagd = HOOFDPATROON[oef.category];
    if (gevraagd) {
      const patroon = patroonVan(oef);
      if (patroon && gevraagd.includes(patroon)) s += 20;
      // Geen patroon (isolatie) of het VERKEERDE patroon op de zwaarste plek van de sessie:
      // dat is de fout die we net gerepareerd hebben, dus straffen we hem hard genoeg om nooit
      // meer gelijk te kunnen spelen met een echte basisbeweging.
      else s -= 22;
    }

    // Een hoofdoefening moet te verzwaren zijn. Voor wie sterker wil worden is een oefening op
    // eigen lichaamsgewicht meteen aan zijn plafond — en `bodyweight squat` stond in de kernlijst,
    // dus die won van `barbell squat`. Alleen een duwtje, geen verbod: bij een beginner zonder
    // alternatief is een bodyweight squat nog altijd beter dan niets.
    if (oef.equipment === "Lichaamsgewicht") s -= 5;
  }

  return s;
}

/**
 * Kiest één oefening per blok.
 *
 * @param {object[]} blokken      wat het model vroeg: [{categorie, mechanic, sets, reps, rust, sectie}]
 * @param {object[]} bibliotheek  rijen uit `exercises`
 * @param {{niveau:string, materiaal:string[]|null, vermijd:string[], zaad:string}} opties
 *   vermijd = ids die deze week al gebruikt zijn; zaad = iets stabiels (bv. plan-id + weeknummer)
 * @returns {{gekozen:object[], tekort:object[]}}
 *   gekozen = blokken mét exercise; tekort = blokken waarvoor niets bruikbaars bestond
 */
export function kiesOefeningen(blokken, bibliotheek, opties = {}) {
  const { niveau = "soms", materiaal = null, vermijd = [], zaad = "" } = opties;
  const gebruikt = new Set(vermijd);
  const gekozen = [];
  const tekort = [];

  // Welke bewegingspatronen deze SESSIE al bevat. Twee keer hetzelfde patroon op één dag is zonde
  // van een slot: een dag met een squat én een leg press traint hetzelfde en laat het scharnier
  // (deadlift, romanian, hip thrust) ongemoeid. Zo dekt een week meer met evenveel oefeningen.
  const patronenVandaag = new Set();

  blokken.forEach((blok, i) => {
    const kandidaten = [];
    for (const oef of bibliotheek) {
      let s = score(oef, blok, { niveau, materiaal });
      if (s < 0) continue;
      // Al gebruikt deze week? Mag nog, maar alleen als laatste redmiddel.
      if (gebruikt.has(oef.id)) s -= 100;
      // Zelfde patroon als iets eerder vandaag: een duwtje weg, geen verbod. Bij een dag die
      // bewust op één patroon draait, wint de beste kandidaat nog altijd.
      const patroon = patroonVan(oef);
      if (patroon && patronenVandaag.has(patroon)) s -= 10;
      kandidaten.push({ oef, s });
    }
    if (kandidaten.length === 0) {
      tekort.push(blok);
      return;
    }
    // Sorteren op score, en bij gelijkspel op een stabiele hash. Zo krijgt niet elk lid met
    // hetzelfde doel exact dezelfde vier oefeningen, terwijl dezelfde week opnieuw opbouwen
    // wél hetzelfde resultaat geeft.
    const sleutel = `${zaad}|${i}|${blok.categorie || ""}`;
    kandidaten.sort((a, b) => (b.s - a.s) || (zaadUit(sleutel + a.oef.id) - zaadUit(sleutel + b.oef.id)));
    const winnaar = kandidaten[0].oef;
    gebruikt.add(winnaar.id);
    const winnaarPatroon = patroonVan(winnaar);
    if (winnaarPatroon) patronenVandaag.add(winnaarPatroon);
    gekozen.push({ ...blok, exercise_id: winnaar.id, naam: winnaar.name, categorie: winnaar.category });
  });

  return { gekozen, tekort };
}

/**
 * Verdeelt de categorieën over de sessies van een week, zodat drie sessies niet drie keer borst
 * zijn. Puur, en bewust simpel: het model mag de verdeling voorstellen, maar als het dat niet doet
 * (of iets onmogelijks voorstelt) is dit het vangnet.
 */
export function verdeelFocus(sessies) {
  const patronen = {
    1: [["benen", "rug", "borst", "core"]],
    // Twee dagen: bovenlichaam en onderlichaam. `rug` stond hier als DERDE categorie op dag 2 en
    // werd dus nooit een hoofdoefening — gemeten resultaat: een week zonder één trekbeweging.
    2: [["borst", "rug", "schouders", "armen"], ["benen", "rug", "core"]],
    3: [["borst", "schouders", "armen"], ["rug", "armen", "core"], ["benen", "core"]],
    4: [["borst", "schouders"], ["rug", "armen"], ["benen", "core"], ["schouders", "armen", "core"]],
    5: [["borst"], ["rug"], ["benen"], ["schouders", "armen"], ["core", "benen"]],
  };
  const n = Math.min(5, Math.max(1, sessies));
  return patronen[n] || patronen[3];
}

/**
 * Controleert dat elk voorschrift naar een bestaande oefening wijst. Dit is de laatste poort vóór
 * er iets naar het lid gaat — ook als een latere wijziging het model tóch ids laat noemen.
 */
export function keurVoorschriften(voorschriften, geldigeIds) {
  const geldig = geldigeIds instanceof Set ? geldigeIds : new Set(geldigeIds || []);
  const fout = [];
  for (const v of voorschriften || []) {
    if (!v.exercise_id) fout.push({ v, reden: "geen oefening gekozen" });
    else if (!geldig.has(v.exercise_id)) fout.push({ v, reden: `oefening ${v.exercise_id} bestaat niet` });
    else if (!Number.isFinite(v.sets) || v.sets < 1 || v.sets > 10) fout.push({ v, reden: `onmogelijk aantal sets: ${v.sets}` });
  }
  return { ok: fout.length === 0, fout };
}
