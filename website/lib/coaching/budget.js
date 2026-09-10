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

/** Puur en testbaar: een rommelige env-waarde mag de rem nooit openzetten. */
export function leesDagbudget(ruw) {
  const n = Number(ruw);
  return Number.isFinite(n) && n > 0 ? n : 2_000_000;
}

/** Standaard 2 dollar per dag. Aan de gemeten prijzen zijn dat honderden weekzinnen. */
export const DAGBUDGET_MICRO = leesDagbudget(process.env.COACH_AI_DAGBUDGET_MICRO);

/** Handmatig gezet op 10-09-2026. Bewust geen koersfeed: dit is een indicatie, geen boekhouding. */
export const USD_EUR = 0.92;
export const euroVan = (micro) => "€ " + ((micro || 0) / 1_000_000 * USD_EUR).toFixed(2).replace(".", ",");

/**
 * De uitkomsten die betekenen dat het lid er iets aan had. Alles daarbuiten is geld dat wegging
 * zonder resultaat — zie 0161 voor waarom `ok` die vraag niet beantwoordt.
 */
export const GELEVERD = new Set(["plan_geschreven", "zin_geschreven", "menu_geschreven"]);

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
    const { data, error } = await admin.from("coaching_verbruik").insert(rij).select("id").single();
    if (error) console.error("coaching_verbruik insert:", error.message);
    return { ...rij, id: data?.id || null };
  } catch (e) {
    console.error("coaching_verbruik insert:", e?.message || e);
    return { ...rij, id: null };
  }
}

/**
 * Wat er uiteindelijk uit die aanroep kwam. Apart van boekVerbruik omdat dat VÓÓR het antwoord
 * gebeurt: de tokens zijn dan al betaald, maar of er een bruikbaar plan uitrolde weet je pas na het
 * lezen, het keuren en het opslaan. Zie 0161.
 *
 * Best-effort, net als het boeken zelf: een logboek mag nooit een lid tegenhouden.
 */
export async function boekResultaat(admin, id, resultaat) {
  if (!id || !resultaat) return;
  try {
    const { error } = await admin.from("coaching_verbruik").update({ resultaat }).eq("id", id);
    if (error) console.error("coaching_verbruik resultaat:", error.message);
  } catch (e) {
    console.error("coaching_verbruik resultaat:", e?.message || e);
  }
}

/**
 * Een aanroep die NIET doorging omdat de rem dichtstond. Kost nul, maar het is wel een gebeurtenis:
 * het commentaar bovenaan dit bestand belooft sinds dag één "een melding in het logboek zodat de
 * eigenaar weet dat hij hem moet verhogen", en die melding bestond niet — `magNog` staat vóór
 * `boekVerbruik`, dus een geweigerde aanroep liet precies niets na.
 */
export async function boekWeigering(admin, { gymId, memberId, soort, reden }) {
  try {
    await admin.from("coaching_verbruik").insert({
      gym_id: gymId, member_id: memberId || null, soort: "geweigerd", model: "geen",
      in_tokens: 0, uit_tokens: 0, kost_micro: 0, ok: false,
      fout: String(reden || "").slice(0, 500), resultaat: `geweigerd:${soort}`,
    });
  } catch (e) {
    console.error("coaching_verbruik weigering:", e?.message || e);
  }
}

/** magNog, maar dan met een spoor wanneer hij nee zegt. Gebruik deze, niet magNog. */
export async function magNogOfBoek(admin, { gymId, memberId, soort }) {
  const rem = await magNog(admin, gymId);
  if (!rem.mag) await boekWeigering(admin, { gymId, memberId, soort, reden: rem.reden });
  return rem;
}

/** Hulpje voor de beheerpagina: wat kostte de coach over een periode. */
export function telOp(rijen) {
  const uit = {
    aanroepen: 0, mislukt: 0, micro: 0, inTokens: 0, uitTokens: 0,
    // Wat `ok` niet vertelt. Zie 0161: `ok` betekent alleen dat de gateway tekst teruggaf.
    geleverd: 0, zonderResultaat: 0, zonderResultaatMicro: 0, onbekend: 0, geweigerd: 0,
  };
  for (const r of rijen || []) {
    // Een weigering is geen aanroep: hij kostte niets en er ging niets de deur uit.
    if (r.soort === "geweigerd") { uit.geweigerd++; continue; }
    uit.aanroepen++;
    if (!r.ok) uit.mislukt++;
    uit.micro += r.kost_micro || 0;
    uit.inTokens += r.in_tokens || 0;
    uit.uitTokens += r.uit_tokens || 0;
    if (r.resultaat == null) uit.onbekend++;
    else if (GELEVERD.has(r.resultaat)) uit.geleverd++;
    else { uit.zonderResultaat++; uit.zonderResultaatMicro += r.kost_micro || 0; }
  }
  return { ...uit, euro: uit.micro / 1_000_000 * USD_EUR };
}

export { kostMicro };
