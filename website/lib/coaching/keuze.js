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

  blokken.forEach((blok, i) => {
    const kandidaten = [];
    for (const oef of bibliotheek) {
      const s = score(oef, blok, { niveau, materiaal });
      if (s < 0) continue;
      // Al gebruikt deze week? Mag nog, maar alleen als laatste redmiddel.
      kandidaten.push({ oef, s: gebruikt.has(oef.id) ? s - 100 : s });
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
    2: [["borst", "schouders", "armen"], ["benen", "rug", "core"]],
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
