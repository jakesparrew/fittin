import { after } from "next/server";
import { wie } from "@/lib/coaching/wie.js";
import { planOpdracht, menuOpdracht } from "@/lib/coaching/opdracht.js";

// Meekijken terwijl je coach schrijft.
//
// WAT DIT OPLOST. Tot nu was een plan of een menu één serveractie van 27 tot 50 seconden waarin het
// lid niets te zien kreeg en het scherm niet mocht sluiten. Allebei die dingen zijn hier weg:
//
//  1. HET SCHERM MAG DICHT. Het werk hangt niet meer aan de verbinding met de browser. `after()`
//     houdt de aanroep in leven tot de opdracht af is, ook wanneer het tabblad weg is — wie
//     terugkomt, vindt zijn plan. Vroeger was dat onmogelijk: de wizard deed twee serveracties na
//     elkaar, dus wie tijdens de eerste wegklikte verstuurde de tweede nooit.
//  2. ER IS IETS TE ZIEN. De gateway streamt (gemeten 11-09: eerste tekst na 1,6 s in plaats van
//     na het volledige antwoord), en allebei de antwoordvormen beginnen met een zin in mensentaal.
//     Het lid leest dus binnen twee seconden de zin die aan hém gericht is, en ziet daarna zijn
//     dagen één voor één verschijnen.
//
// Wat hier NIET gebeurt: beslissen wat er gemaakt wordt. Dat staat in opdracht.js, samen met de
// serveracties, zodat de voorwaarden niet uit elkaar kunnen lopen.

export const dynamic = "force-dynamic";
// Dezelfde 300 als de cron en de coachingpagina. Het menu is met afstand de traagste aanroep.
export const maxDuration = 300;

// Hoe vaak een half afgemaakt concept doorgestuurd wordt. Elke delta doorsturen is tientallen
// berichten per seconde voor tekst die het oog toch niet zo snel leest.
const CONCEPT_MS = 400;

export async function POST(req) {
  const mij = await wie();
  // Dezelfde poort als de serveracties. Geen aparte kopie — zie wie.js.
  if (!mij) return new Response("Geen toegang.", { status: 403 });

  let body = {};
  try { body = await req.json(); } catch { /* leeg mag */ }
  const wat = body?.wat === "menu" ? "menu" : "plan";

  const enc = new TextEncoder();
  let stuur = () => {}, sluit = () => {};
  let weg = false;

  const stroom = new ReadableStream({
    start(c) {
      stuur = (o) => {
        if (weg) return;
        try { c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); } catch { weg = true; }
      };
      sluit = () => { if (!weg) { weg = true; try { c.close(); } catch { /* al dicht */ } } };
    },
    // Het tabblad is weg. We stoppen met sturen — maar niet met werken.
    cancel() { weg = true; },
  });

  let hangend = null, laatste = 0;
  function melden(g) {
    if (g.t !== "concept") {
      // Een stap is een grens; het laatste concept hoort er nog vóór.
      if (hangend) { stuur(hangend); hangend = null; }
      stuur(g);
      return;
    }
    hangend = g;
    const nu = Date.now();
    if (nu - laatste >= CONCEPT_MS) { laatste = nu; stuur(hangend); hangend = null; }
  }

  const werk = (async () => {
    const uit = wat === "menu"
      ? await menuOpdracht(mij, { opnieuw: body?.opnieuw === true, melden })
      : await planOpdracht(mij, { weken: parseInt(body?.weken, 10) || 8, melden });
    if (hangend) { stuur(hangend); hangend = null; }
    stuur(uit.error ? { t: "fout", tekst: uit.error } : { t: "klaar", tekst: uit.message });
  })().catch((e) => {
    // maakPlan werpt op vier plekken. Zonder dit bleef het wachtscherm eeuwig draaien.
    console.error("coaching-stroom:", e);
    stuur({ t: "fout", tekst: `Er liep iets mis: ${e?.message || "onbekende fout"}` });
  }).finally(sluit);

  // DIT is wat "je mag het scherm sluiten" waar maakt: het platform houdt de aanroep in leven tot
  // `werk` klaar is, ook als er niemand meer meeleest.
  after(werk);

  return new Response(stroom, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      // Zonder dit buffert een omgekeerde proxy de hele stroom op en komt alles alsnog in één keer.
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
