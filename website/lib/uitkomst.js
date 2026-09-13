// Wat een beheerknop terugzegt.
//
// WAAROM DIT BESTAAT. De beheeracties schreven op 43 plekken naar de databank zonder naar het
// antwoord te kijken, en gaven daarna niets of een kaal "ok" terug. Het scherm maakte daar
// "Opgeslagen ✓" van — ook als er niets opgeslagen was. Twee manieren waarop dat misging:
//
//   1. Een echte fout (dubbele sleutel, verwijzing naar iets dat niet meer bestaat) werd genegeerd.
//   2. Geen fout, maar ook geen effect. Een UPDATE of DELETE die door de rechten (RLS) niets mag
//      raken, antwoordt in PostgREST met succes en nul rijen. Dat is in dit project al eens gemeten
//      en is precies het soort stilte waar een beheerder op een knop blijft drukken.
//
// De regel voor elke beheeractie is dus: ofwel `{ error: "<zin>" }`, ofwel `{ ok: true, message:
// "<wat er gebeurde> ✓" }`. De melding noemt het ding bij naam, zodat wie meekijkt — Ran — ziet
// wát er gebeurde en niet enkel dát er iets gebeurde.

/** Een fout uit Supabase/Postgres als zin voor een beheerder, met de technische tekst erachter. */
export function leesbareFout(error, wat = "Opslaan") {
  if (!error) return null;
  const code = error.code || "";
  const tech = String(error.message || error || "").slice(0, 160);
  const zin = {
    "23505": "dat bestaat al",
    "23503": "het hangt nog aan iets anders vast (of verwijst naar iets dat niet meer bestaat)",
    "23502": "er ontbreekt een verplicht veld",
    "23514": "een waarde valt buiten wat toegestaan is",
    "22P02": "een waarde heeft het verkeerde formaat",
    "42501": "je hebt hier geen rechten voor",
    "PGRST116": "het item werd niet gevonden",
  }[code];
  if (zin) return `${wat} mislukt: ${zin}.`;
  if (/fetch failed|network|timeout|ECONN/i.test(tech)) return `${wat} mislukt: geen verbinding met de databank. Probeer opnieuw.`;
  return `${wat} mislukt: ${tech || "onbekende fout"}.`;
}

/**
 * Het antwoord van een schrijfactie nakijken.
 *
 * Geef bij UPDATE en DELETE `{ count: "exact" }` mee aan de query: dan betekent `count === 0` dat er
 * niets geraakt werd, en dat wordt een fout in plaats van een stil succes. Bij INSERT en UPSERT
 * gooit een rechtenprobleem wél een fout, dus daar volstaat `error`.
 *
 * @returns {null | {error: string}} null = in orde
 */
export function nagekeken(res, wat = "Opslaan") {
  if (res?.error) return { error: leesbareFout(res.error, wat) };
  if (res && res.count === 0) {
    return { error: `${wat}: er is niets gewijzigd — het bestaat niet (meer), of je hebt er geen rechten op.` };
  }
  return null;
}

/** Een fout die onderweg GEGOOID werd (mail, Stripe, netwerk) als zin. */
export function gegooid(e, wat = "Actie") {
  const tech = String(e?.message || e || "").slice(0, 160);
  return { error: `${wat} mislukt: ${tech || "onbekende fout"}.` };
}
