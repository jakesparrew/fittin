// De vaste specialiteiten die een coach kan kiezen. Eén lijst, gedeeld door de kiezer (waar de
// coach of beheerder ze aanvinkt) en de weergave (chips op de publieke coachpagina's).
//
// WAAROM VAN VRIJ TEKSTVELD NAAR LABELS: een tekstveld gaf per coach een andere schrijfwijze
// ("kracht" / "Krachttraining" / "powerlifting & kracht"), die je niet kan filteren, niet kan
// tonen als nette chips en niet kan matchen met wat een lid zoekt. Een vaste lijst lost dat op.
export const SPECIALTIES = [
  "Krachttraining",
  "Afvallen & vetverlies",
  "Spieropbouw",
  "Conditie & cardio",
  "Functioneel trainen",
  "Revalidatie",
  "Beginners",
  "Voeding & lifestyle",
  "Bootcamp / HIIT",
  "Powerlifting",
  "Vrouwen",
  "Senioren",
];

// Opslagvorm: de gekozen labels als één string, gescheiden door " · ". Bewust de bestaande
// coach_specialty-tekstkolom (geen migratie nodig), en meteen leesbaar mocht ze ooit kaal getoond
// worden.
export const joinSpecialties = (labels) => labels.filter(Boolean).join(" · ");

// Een opgeslagen string terug naar losse labels. Splitst op zowel "·" als "," zodat de oude
// vrije-tekstwaarden ("krachttraining, afvallen") ook netjes in chips vallen; lege stukken eruit.
export function parseSpecialties(value) {
  return String(value || "")
    .split(/[·,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

// Welke vaste labels zitten er in een bestaande (mogelijk vrije-tekst) waarde? Case-ongevoelig,
// zodat "kracht" of "KRACHTTRAINING" allebei op "Krachttraining" vallen bij het voorselecteren.
export function matchKnown(value) {
  const laag = String(value || "").toLowerCase();
  return SPECIALTIES.filter((s) => laag.includes(s.toLowerCase().split(" ")[0]));
}
