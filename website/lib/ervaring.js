// De vraag na de sessie: drie antwoorden en, bij Oké of Niet goed, waarom. Gedeeld door mail, bedankpagina en beheer.
// De score blijft in session_feedback.rating (5 · 3 · 1), zodat oude sterrenscores vergelijkbaar blijven.

export const ANTWOORDEN = [
  { s: 5, e: "😃", l: "Top" },
  { s: 3, e: "🙂", l: "Oké" },
  { s: 1, e: "😕", l: "Niet goed" },
];
export const antwoordVan = (rating) => (rating >= 4 ? ANTWOORDEN[0] : rating === 3 ? ANTWOORDEN[1] : rating ? ANTWOORDEN[2] : null);

export const REDENEN = [
  { v: "netheid", l: "🧼 Niet netjes" },
  { v: "toestel", l: "🔧 Toestel stuk of ontbrak" },
  { v: "temperatuur", l: "🌡 Te warm / te koud" },
  { v: "deur", l: "🚪 Deur of code" },
  { v: "geur", l: "👃 Geur / verluchting" },
  { v: "geluid", l: "🔊 Muziek / geluid" },
  { v: "ikzelf", l: "😮‍💨 Lag aan mezelf" },
  { v: "anders", l: "💬 Iets anders" },
];
export const REDEN_SET = new Set(REDENEN.map((r) => r.v));
export const redenLabel = (v) => REDENEN.find((r) => r.v === v)?.l || v;

/** Verdeling en top-redenen voor het beheerscherm. */
export function ervaringCijfers(rijen) {
  const n = rijen.length;
  const tel = (f) => rijen.filter(f).length;
  const top = tel((r) => r.rating >= 4), oke = tel((r) => r.rating === 3), slecht = tel((r) => r.rating && r.rating < 3);
  const per = new Map();
  for (const r of rijen) for (const x of r.redenen || []) per.set(x, (per.get(x) || 0) + 1);
  return {
    n, top, oke, slecht,
    pct: (x) => (n ? Math.round((x / n) * 100) : 0),
    redenen: [...per.entries()].sort((a, b) => b[1] - a[1]).map(([v, k]) => ({ v, l: redenLabel(v), k })),
  };
}
