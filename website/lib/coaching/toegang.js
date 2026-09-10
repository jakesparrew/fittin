// Wie de AI-coach mag gebruiken.
//
// Bewust een lijst in code en geen vinkje in de databank: dit is een proefgroep van twee mensen,
// geen functie met een instellingenscherm. Een schakelaar bouwen voor iets dat je één keer omzet,
// is meer werk dan de schakelaar waard is — en meer dat stuk kan gaan.
//
// De poort staat DICHT als er niets ingesteld is. Dat is de belangrijkste eigenschap van dit
// bestand: een vergeten of leeggelopen omgevingsvariabele mag de coach nooit voor 86 leden
// openzetten. Openen is een handeling, geen bijwerking.

/** De proefgroep zolang `COACH_AI_TOEGANG` niet ingesteld is. */
export const PROEFGROEP = ["ran.knockaert@gmail.com", "gaetanjansseune@gmail.com"];

/** Zet `COACH_AI_TOEGANG=iedereen` om hem voor alle leden open te zetten. */
export const IEDEREEN = "iedereen";

function ingesteld() {
  const v = process.env.COACH_AI_TOEGANG;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function coachingOpenVoorIedereen() {
  return (ingesteld() || "").toLowerCase() === IEDEREEN;
}

/** De toegelaten adressen, altijd in kleine letters. */
export function toegelatenAdressen() {
  const v = ingesteld();
  if (!v || v.toLowerCase() === IEDEREEN) return v ? [] : PROEFGROEP;
  return v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Mag dit profiel de AI-coach zien en gebruiken?
 *
 * Het beheerdersaccount mag altijd — anders kan de eigenaar zijn eigen functie niet bekijken vanaf
 * het account waarmee hij inlogt. Verder alleen wie in de lijst staat.
 */
export function magCoaching(profiel) {
  if (!profiel) return false;
  if (coachingOpenVoorIedereen()) return true;
  if (profiel.role === "beheerder") return true;
  const email = String(profiel.email || "").trim().toLowerCase();
  return !!email && toegelatenAdressen().includes(email);
}
