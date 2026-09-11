import { describe, it, expect } from "vitest";
import { PRIJZEN, MODELLEN, isGeprijsd, kostMicro, coachAan, leesStroom } from "./model.js";
import { telOp, DAGBUDGET_MICRO } from "./budget.js";

// De belangrijkste test in dit bestand is de eerste. Zonder die regel kan er een model in de keten
// staan waarvan we de prijs niet kennen, en dan boekt het stilletjes aan het duurste tarief tot het
// op de factuur staat. Dat is in het zusterproject echt gebeurd.

describe("elk model dat we kunnen aanroepen heeft een prijs", () => {
  it("elke rol in MODELLEN wijst naar een geprijsd model", () => {
    for (const [rol, model] of Object.entries(MODELLEN)) {
      expect(isGeprijsd(model), `rol "${rol}" wijst naar ${model}, dat niet in PRIJZEN staat`).toBe(true);
    }
  });

  it("elke prijsrij is volledig ingevuld", () => {
    for (const [model, p] of Object.entries(PRIJZEN)) {
      expect(p.in, `${model} mist een invoerprijs`).toBeGreaterThan(0);
      expect(p.uit, `${model} mist een uitvoerprijs`).toBeGreaterThan(0);
      // Uitvoer is bij elk model duurder dan invoer; is dat omgekeerd, dan is er een tikfout.
      expect(p.uit, `${model}: uitvoer hoort duurder te zijn dan invoer`).toBeGreaterThan(p.in);
    }
  });

  it("kent geen enkel model dat wij niet expliciet gekozen hebben", () => {
    // Een redeneermodel rekent zijn verborgen redenering als uitvoer af: duizenden tokens, nul
    // zichtbare tekst. Die horen hier niet, en deze test maakt het toevoegen ervan opzettelijk.
    for (const model of Object.keys(PRIJZEN)) {
      expect(model.startsWith("anthropic/"), `${model} is geen bewust gekozen model`).toBe(true);
    }
  });
});

describe("kostberekening", () => {
  it("rekent in hele micro-USD, niet in floats", () => {
    // Bij $1 per miljoen tokens kost één token één micro-USD. Dus 1.000 in + 1.000 uit op Haiku
    // ($1/$5) = 1.000 + 5.000 = 6.000 micro-USD, oftewel $0,006.
    expect(kostMicro("anthropic/claude-haiku-4.5", 1000, 1000)).toBe(6000);
    expect(Number.isInteger(kostMicro("anthropic/claude-sonnet-5", 1234, 5678))).toBe(true);
  });

  it("een echte weekzin kost minder dan een tiende cent", () => {
    // ~2.000 tokens context, ~200 tokens antwoord op het goedkope model.
    const micro = kostMicro(MODELLEN.tekst, 2000, 200);
    expect(micro).toBeLessThan(10_000); // < $0,01
  });

  it("een volledig plan kost minder dan tien cent", () => {
    // Ruim gerekend: 8.000 tokens context, 4.000 tokens plan op het slimme model.
    const micro = kostMicro(MODELLEN.plan, 8000, 4000);
    expect(micro).toBeLessThan(100_000); // < $0,10
  });

  it("geeft null bij een onbekend model in plaats van te gokken", () => {
    expect(kostMicro("iets/anders", 100, 100)).toBe(null);
  });
});

describe("aan of uit", () => {
  it("staat uit zonder sleutel — geen halve toestand", () => {
    const oud = process.env.COACH_AI_GATEWAY_KEY;
    delete process.env.COACH_AI_GATEWAY_KEY;
    expect(coachAan()).toBe(false);
    if (oud) process.env.COACH_AI_GATEWAY_KEY = oud;
  });

  it("de noodknop wint van de sleutel", () => {
    const oudK = process.env.COACH_AI_GATEWAY_KEY;
    const oudE = process.env.AI_COACH_ENABLED;
    process.env.COACH_AI_GATEWAY_KEY = "test";
    process.env.AI_COACH_ENABLED = "false";
    expect(coachAan()).toBe(false);
    process.env.AI_COACH_ENABLED = "true";
    expect(coachAan()).toBe(true);
    if (oudK === undefined) delete process.env.COACH_AI_GATEWAY_KEY; else process.env.COACH_AI_GATEWAY_KEY = oudK;
    if (oudE === undefined) delete process.env.AI_COACH_ENABLED; else process.env.AI_COACH_ENABLED = oudE;
  });
});

describe("budget", () => {
  it("heeft een dagrem die niet nul is", () => {
    expect(DAGBUDGET_MICRO).toBeGreaterThan(0);
  });

  it("telt verbruik op, inclusief de mislukte aanroepen", () => {
    const uit = telOp([
      { ok: true, kost_micro: 1000, in_tokens: 100, uit_tokens: 50 },
      { ok: false, kost_micro: 200, in_tokens: 80, uit_tokens: 0 },
    ]);
    expect(uit.aanroepen).toBe(2);
    expect(uit.mislukt).toBe(1);
    expect(uit.micro).toBe(1200);
    expect(uit.inTokens).toBe(180);
  });

  it("gaat om met een lege lijst", () => {
    expect(telOp([]).aanroepen).toBe(0);
    expect(telOp(null).micro).toBe(0);
  });
});

describe("de gestreamde aanroep", () => {
  // Een nep-antwoord in de vorm die de gateway ECHT stuurt, gemeten op 11-09-2026. Het verschil met
  // de eigen API van Anthropic zit in de usage: daar staat het invoergetal in `message_start`, hier
  // staan allebei de getallen in `message_delta` en is `message_start` nul.
  const antwoord = (regels) => ({
    body: new ReadableStream({
      start(c) {
        const e = new TextEncoder();
        // Bewust op een RARE plek geknipt: een netwerkstuk eindigt zelden op een regelgrens, en een
        // lezer die dat niet aankan, verliest stilletjes brokken tekst.
        const alles = regels.map((r) => `data: ${JSON.stringify(r)}\n\n`).join("");
        for (let i = 0; i < alles.length; i += 7) c.enqueue(e.encode(alles.slice(i, i + 7)));
        c.close();
      },
    }),
  });

  const tekstDelta = (t) => ({ type: "content_block_delta", delta: { type: "text_delta", text: t } });

  it("telt de invoertokens uit message_delta — message_start staat daar op nul", async () => {
    const uit = await leesStroom(antwoord([
      { type: "message_start", message: { usage: { input_tokens: 0, output_tokens: 0 } } },
      tekstDelta("Hallo"),
      { type: "message_delta", usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 }, delta: { stop_reason: "end_turn" } },
    ]), { model: "anthropic/claude-haiku-4.5", onDelta: () => {} });

    expect(uit.ok).toBe(true);
    expect(uit.inTokens).toBe(1_000_000);
    expect(uit.uitTokens).toBe(1_000_000);
    // Haiku 4.5: $1 per miljoen in, $5 per miljoen uit. Op nul invoer zou hier 5.000.000 staan.
    expect(uit.kostMicro).toBe(6_000_000);
  });

  it("plakt de brokken weer aan elkaar, ook midden in een woord geknipt", async () => {
    const uit = await leesStroom(antwoord([
      tekstDelta('{"toelichting": "Een '), tekstDelta("halve zin"), tekstDelta('."}'),
      { type: "message_delta", usage: { input_tokens: 10, output_tokens: 20 } },
    ]), { model: "anthropic/claude-haiku-4.5", onDelta: () => {} });
    expect(uit.tekst).toBe('{"toelichting": "Een halve zin."}');
  });

  it("een antwoord zonder tekst is een mislukking, geen leeg antwoord", async () => {
    // Precies het patroon waarmee een redeneermodel elders het budget opbrandde: tokens eruit,
    // niets zichtbaars in.
    const uit = await leesStroom(antwoord([
      { type: "message_delta", usage: { input_tokens: 10, output_tokens: 5000 }, delta: { stop_reason: "max_tokens" } },
    ]), { model: "anthropic/claude-haiku-4.5", onDelta: () => {} });
    expect(uit.ok).toBe(false);
    expect(uit.fout).toMatch(/max_tokens/);
  });

  it("een fout midden in de stroom komt eruit als fout", async () => {
    const uit = await leesStroom(antwoord([
      tekstDelta("begin"),
      { type: "error", error: { message: "overloaded" } },
    ]), { model: "anthropic/claude-haiku-4.5", onDelta: () => {} });
    expect(uit.ok).toBe(false);
    expect(uit.fout).toMatch(/overloaded/);
  });

  it("een meekijker die stukloopt, gooit het betaalde antwoord niet weg", async () => {
    const uit = await leesStroom(antwoord([
      tekstDelta("blijft staan"),
      { type: "message_delta", usage: { input_tokens: 10, output_tokens: 20 } },
    ]), { model: "anthropic/claude-haiku-4.5", onDelta: () => { throw new Error("kapot"); } });
    expect(uit.ok).toBe(true);
    expect(uit.tekst).toBe("blijft staan");
  });
});
