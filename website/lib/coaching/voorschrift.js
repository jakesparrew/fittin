// Hoe zwaar moet dit zijn?
//
// HET GAT DAT DIT DICHT. Een AI-plan heeft geen streefgewichten: `target_weight_kg` is altijd null,
// want het model weet niet hoe sterk dit lid is en het lid vult nergens een getal in — en dat laatste
// is bewust, want de zaal bewijst dat niemand dat doet (zeven workout-logs ooit, over 86 leden).
//
// Gevolg tot nu: het lid las "Barbell Squat — 4×8" en moest zelf maar raden wat er op de stang moest.
// Voor iemand die nog nooit gestructureerd getraind heeft, is dat precies de vraag waar hij op
// vastloopt. De coach zweeg over het enige dat hij niet kon opzoeken.
//
// DE OPLOSSING VRAAGT NIETS. Geen invoerveld, geen getal, geen extra scherm: één zin die uitlegt hoe
// je zelf het juiste gewicht vindt. Dat is ook hoe een coach het in de zaal zou zeggen.
//
// Waarom alleen bij de HOOFDOEFENING: die bepaalt de zwaarte van de sessie, en bij elke oefening
// dezelfde zin herhalen maakt van een advies behang. Staat er wél een gewicht, dan zwijgt de hint —
// dan is de vraag al beantwoord.

/** De zin zelf. Eén plek, zodat de app en de mail nooit iets anders zeggen. */
export const LAADHINT = "Kies een gewicht waarbij de laatste twee herhalingen net lukken.";

/** Iets langer, voor wie nog nooit getraind heeft: die heeft ook een vertrekpunt nodig. */
export const LAADHINT_BEGINNER =
  "Kies een gewicht waarbij de laatste twee herhalingen net lukken. Weet je het niet? Begin licht — de eerste keer is om te voelen, niet om te presteren.";

/**
 * Hoort er bij dit voorschrift een laadhint?
 * @param {string} sectie  "Warming-up" | "Hoofdoefening" | "Accessoire" | "Finisher"
 * @param {number|null} kg streefgewicht, of null wanneer er geen is
 */
export function toonLaadhint(sectie, kg) {
  if (Number.isFinite(kg) && kg > 0) return false;   // er staat al een gewicht
  return sectie === "Hoofdoefening";
}

/** De juiste zin voor dit lid. `ervaring` komt uit de intake. */
export function laadhint(ervaring) {
  return ervaring === "nooit" ? LAADHINT_BEGINNER : LAADHINT;
}
