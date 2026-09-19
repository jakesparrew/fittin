// Wie de AI-coach mag gebruiken.
//
// Twee lagen: de proefgroep hieronder (in code), en sinds 0170 de schakelaar `gyms.ai_coach_open` die de
// uitbater zelf omzet in Beheer → AI-coach. Staat die aan, dan mag elk profiel van die gym.
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
export function magCoaching(profiel, { open = false } = {}) {
  if (!profiel) return false;
  // `open` = de schakelaar van de gym (gyms.ai_coach_open, 0170), aan/uit in Beheer → AI-coach. De aanroeper
  // haalt hem op met gymCoachOpen(); zonder die waarde blijft de oude, dichte poort gelden.
  // Een coach traint niet voor zichzelf via de app en boekt voor klanten: de schakelaar opent de coach voor LEDEN.
  if (open && profiel.role !== "coach") return true;
  if (coachingOpenVoorIedereen()) return true;
  if (profiel.role === "beheerder") return true;
  const email = String(profiel.email || "").trim().toLowerCase();
  return !!email && toegelatenAdressen().includes(email);
}

// De schakelaar per gym (0170). Kort gecachet: de cron en de pagina's vragen hem vaak, hij verandert zelden.
const cache = new Map();
export async function gymCoachOpen(admin, gymId) {
  if (!admin || !gymId) return false;
  const c = cache.get(gymId);
  if (c && Date.now() - c.t < 60_000) return c.open;
  const { data } = await admin.from("gyms").select("ai_coach_open").eq("id", gymId).maybeSingle();
  const open = !!data?.ai_coach_open;
  cache.set(gymId, { open, t: Date.now() });
  return open;
}
export const vergeetCoachOpen = (gymId) => cache.delete(gymId);

/** magCoaching mét de schakelaar van de gym van dit profiel. Dit is wat elke ingang hoort te vragen. */
export async function magCoachingNu(admin, profiel) {
  if (!profiel) return false;
  return magCoaching(profiel, { open: await gymCoachOpen(admin, profiel.gym_id) });
}
