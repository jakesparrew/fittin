// De rem op wat de AI-coach mag kosten, plus het logboek waarop die rem telt.
//
// Waarom dit bestaat: de vorige AI-poging in dit huis brandde het budget op zonder dat iemand het
// zag — een redeneermodel rekende zijn verborgen redenering als uitvoer af, duizenden tokens per
// beurt, nul zichtbare tekst. Dat werd pas zichtbaar op de factuur. Elke aanroep hier schrijft een
// rij, ook een mislukte, en de dagrem telt op wat er vandaag al doorheen ging.
//
// Bewust een dagrem en geen maandrem: een maandrem die vol loopt, valt stil op de 20e en dan staat
// de coach tien dagen uit. Een dagrem die vol loopt kost één dag, en de volgende ochtend loopt hij
// weer — met een melding in het logboek zodat de eigenaar weet dat hij hem moet verhogen.

import { kostMicro } from "./model.js";

/** Standaard 2 dollar per dag. Aan de gemeten prijzen zijn dat honderden weekzinnen. */
export const DAGBUDGET_MICRO = Number(process.env.COACH_AI_DAGBUDGET_MICRO || 2_000_000);

/** Begin van vandaag in Brussel, als ISO — zodat de rem meeloopt met de kalenderdag van de gym. */
export function beginVanVandaag(nu = new Date()) {
  const brussel = new Date(nu.toLocaleString("en-US", { timeZone: "Europe/Brussels" }));
  brussel.setHours(0, 0, 0, 0);
  // Terugrekenen naar echte UTC: het verschil tussen de lokale voorstelling en het echte moment.
  const verschuiving = nu.getTime() - new Date(nu.toLocaleString("en-US", { timeZone: "Europe/Brussels" })).getTime();
  return new Date(brussel.getTime() + verschuiving).toISOString();
}

/**
 * Wat ging er vandaag al doorheen, in micro-USD.
 * Faalt de vraag, dan geven we null terug en NIET 0 — anders zou een databankstoring de rem
 * stilletjes openzetten.
 */
export async function verbruiktVandaag(admin, gymId) {
  const { data, error } = await admin
    .from("coaching_verbruik")
    .select("kost_micro")
    .eq("gym_id", gymId)
    .gte("created_at", beginVanVandaag());
  if (error) return null;
  return (data || []).reduce((som, r) => som + (r.kost_micro || 0), 0);
}

/**
 * Mag er nog een aanroep bij? Geeft een reden terug in plaats van alleen true/false, zodat de
 * aanroeper het lid iets zinnigs kan tonen in plaats van een stilte.
 */
export async function magNog(admin, gymId) {
  const verbruikt = await verbruiktVandaag(admin, gymId);
  if (verbruikt === null) return { mag: false, reden: "verbruik niet op te vragen — geen aanroep zonder rem" };
  if (verbruikt >= DAGBUDGET_MICRO) {
    return { mag: false, reden: "dagbudget bereikt", verbruikt };
  }
  return { mag: true, verbruikt };
}

/**
 * Boekt één aanroep. Best-effort: mislukt het boeken zelf, dan mag dat de coach niet stilleggen —
 * maar het gaat wél naar de console zodat het in de Vercel-logs staat.
 */
export async function boekVerbruik(admin, { gymId, memberId, soort, uitkomst }) {
  const rij = {
    gym_id: gymId,
    member_id: memberId || null,
    soort,
    model: uitkomst?.model || "onbekend",
    in_tokens: uitkomst?.inTokens || 0,
    uit_tokens: uitkomst?.uitTokens || 0,
    kost_micro: uitkomst?.kostMicro ?? 0,
    ok: !!uitkomst?.ok,
    fout: uitkomst?.ok ? null : String(uitkomst?.fout || "").slice(0, 500),
  };
  try {
    const { error } = await admin.from("coaching_verbruik").insert(rij);
    if (error) console.error("coaching_verbruik insert:", error.message);
  } catch (e) {
    console.error("coaching_verbruik insert:", e?.message || e);
  }
  return rij;
}

/** Hulpje voor de beheerpagina: wat kostte de coach over een periode. */
export function telOp(rijen) {
  const uit = { aanroepen: 0, mislukt: 0, micro: 0, inTokens: 0, uitTokens: 0 };
  for (const r of rijen || []) {
    uit.aanroepen++;
    if (!r.ok) uit.mislukt++;
    uit.micro += r.kost_micro || 0;
    uit.inTokens += r.in_tokens || 0;
    uit.uitTokens += r.uit_tokens || 0;
  }
  return { ...uit, euro: uit.micro / 1_000_000 * 0.92 }; // ruwe omrekening, enkel ter indicatie
}

export { kostMicro };
