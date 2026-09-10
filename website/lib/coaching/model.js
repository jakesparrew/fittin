// De enige plek waar de AI-coach met een taalmodel praat.
//
// Eigen sleutel, eigen rekening: `COACH_AI_GATEWAY_KEY` staat bewust los van al de rest, zodat de
// eigenaar in het Vercel-dashboard kan zien wat de coach kost zonder dat het vermengd raakt met
// andere projecten. Geen sleutel = de coach bestaat niet. Er is geen halve toestand.
//
// Geen SDK, alleen fetch. Dit project heeft als afspraak "geen andere dependencies" en de gateway
// spreekt gewoon het berichtenformaat van Anthropic; een pakket toevoegen zou hier alleen een
// laag tussen ons en het probleem zetten.
//
// 🔑 Drie lessen uit de assistent van SuperHoreca, hier meteen ingebouwd:
//   1. De gateway aanvaardt ALLEEN `Authorization: Bearer`. Stuur je de sleutel als `x-api-key`
//      (wat de SDK standaard doet), dan antwoordt hij met 403/429 en de tekst "free tier" — wat
//      leest als een accountprobleem terwijl het een authenticatieprobleem is. Dagen kwijt.
//   2. Elk model dat we kunnen aanroepen MOET een prijs hebben. Zonder prijs boekt het stilletjes
//      aan het duurste tarief en zie je het pas op de factuur. `lib/coaching/model.test.js` dwingt af.
//   3. Nooit een redeneermodel. Die rekenen hun verborgen redenering als uitvoer af: 5.000 tokens
//      eruit, nul zichtbare tekst, en het budget op. Alleen modellen uit PRIJZEN hieronder.

const GATEWAY = "https://ai-gateway.vercel.sh/v1/messages";

/**
 * Prijzen in micro-USD per miljoen tokens. Eén micro-USD per token bij $1/MTok.
 *
 * GEVERIFIEERD op 10-09-2026 tegen /v1/models van de gateway zelf: Sonnet 5 kost $2 per miljoen
 * invoertokens en $10 per miljoen uitvoertokens, Haiku 4.5 $1 en $5. Dezelfde controle bracht aan
 * het licht dat de gateway `claude-haiku-4.5` schrijft met een PUNT — met het streepje dat hier
 * eerst stond, was elke weekzin stilletjes mislukt.
 */
export const PRIJZEN = {
  "anthropic/claude-sonnet-5": { in: 2_000_000, uit: 10_000_000 },
  "anthropic/claude-haiku-4.5": { in: 1_000_000, uit: 5_000_000 },
};

/**
 * Welk model voor welk werk. Het plan is de enige plek waar echt nagedacht moet worden — daar mag
 * het slimme model staan. De weekzin is drie regels tekst en hoort bij het goedkope model.
 * Allebei te wisselen zonder deploy.
 */
export const MODELLEN = {
  plan: process.env.COACH_AI_MODEL_PLAN || "anthropic/claude-sonnet-5",
  herplan: process.env.COACH_AI_MODEL_PLAN || "anthropic/claude-sonnet-5",
  tekst: process.env.COACH_AI_MODEL_TEKST || "anthropic/claude-haiku-4.5",
};

/** Terugval als het eerste model weigert. Bewust binnen dezelfde prijstabel. */
const TERUGVAL = ["anthropic/claude-sonnet-5", "anthropic/claude-haiku-4.5"];

export const isGeprijsd = (model) => Object.prototype.hasOwnProperty.call(PRIJZEN, model);

/** Staat de coach aan? Sleutel afwezig of noodknop om = nee, en dan wordt er nergens gegokt. */
export function coachAan() {
  if (String(process.env.AI_COACH_ENABLED || "").toLowerCase() === "false") return false;
  return !!process.env.COACH_AI_GATEWAY_KEY;
}

/** Kost van één aanroep in micro-USD (hele getallen — centen zijn te grof, floats liegen). */
export function kostMicro(model, inTokens, uitTokens) {
  const p = PRIJZEN[model];
  if (!p) return null; // onbekend model = onbekende kost; de aanroeper hoort dit te weigeren
  return Math.round((inTokens * p.in) / 1_000_000) + Math.round((uitTokens * p.uit) / 1_000_000);
}

/**
 * Eén aanroep naar het model. Geeft altijd hetzelfde vormpje terug, ook bij falen — de aanroeper
 * hoeft nooit te raden of er iets kwam.
 *
 * @returns {{ok:true, tekst:string, gereedschap:object[], model:string, kostMicro:number, inTokens:number, uitTokens:number}
 *          | {ok:false, fout:string, status:number|null}}
 */
export async function roepModel({ model, system, messages, tools, maxTokens = 4000, temperatuur = 0.3, timeoutMs = 90_000 }) {
  if (!coachAan()) return { ok: false, fout: "De AI-coach staat uit.", status: null };
  if (!isGeprijsd(model)) {
    // Liever hier stoppen dan stilletjes aan een onbekend tarief afrekenen.
    return { ok: false, fout: `Model ${model} staat niet in PRIJZEN — voeg de prijs toe vóór je het gebruikt.`, status: null };
  }

  const body = {
    model,
    max_tokens: maxTokens,
    temperature: temperatuur,
    ...(system ? { system } : {}),
    messages,
    ...(tools?.length ? { tools } : {}),
  };

  const afbreker = new AbortController();
  const wekker = setTimeout(() => afbreker.abort(), timeoutMs);
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        // Bearer, niet x-api-key. Zie les 1 bovenaan.
        Authorization: `Bearer ${process.env.COACH_AI_GATEWAY_KEY}`,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: afbreker.signal,
    });

    const tekstBody = await res.text();
    if (!res.ok) {
      return { ok: false, fout: `gateway ${res.status}: ${tekstBody.slice(0, 300)}`, status: res.status };
    }

    let data;
    try { data = JSON.parse(tekstBody); } catch { return { ok: false, fout: "gateway gaf geen geldige JSON terug", status: res.status }; }

    const blokken = Array.isArray(data.content) ? data.content : [];
    const tekst = blokken.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const gereedschap = blokken.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, naam: b.name, invoer: b.input }));
    const inTokens = data.usage?.input_tokens || 0;
    const uitTokens = data.usage?.output_tokens || 0;

    // Een antwoord zonder tekst én zonder gereedschapsoproep is een mislukking, geen leeg antwoord.
    // Dit is precies het patroon waarmee het redeneermodel bij SuperHoreca het budget opbrandde.
    if (!tekst && gereedschap.length === 0) {
      return { ok: false, fout: `model gaf niets bruikbaars terug (${uitTokens} tokens, stop: ${data.stop_reason || "?"})`, status: res.status };
    }

    return { ok: true, tekst, gereedschap, model, kostMicro: kostMicro(model, inTokens, uitTokens), inTokens, uitTokens };
  } catch (e) {
    const afgebroken = e?.name === "AbortError";
    return { ok: false, fout: afgebroken ? `model antwoordde niet binnen ${Math.round(timeoutMs / 1000)}s` : `netwerkfout: ${e?.message || e}`, status: null };
  } finally {
    clearTimeout(wekker);
  }
}

/**
 * Roept het model aan en valt terug op een ander model als de gateway weigert. Netwerkfouten en
 * time-outs worden NIET herprobeerd op een ander model — dat is geen modelprobleem en een tweede
 * poging kost alleen tijd terwijl het lid wacht.
 */
export async function roepMetTerugval(opties) {
  const keten = [opties.model, ...TERUGVAL.filter((m) => m !== opties.model)];
  let laatste = null;
  for (const model of keten) {
    if (!isGeprijsd(model)) continue;
    const uit = await roepModel({ ...opties, model });
    if (uit.ok) return uit;
    laatste = uit;
    // Alleen bij een weigering van de gateway (4xx/5xx) een ander model proberen.
    if (uit.status === null) break;
  }
  return laatste || { ok: false, fout: "geen bruikbaar model beschikbaar", status: null };
}
