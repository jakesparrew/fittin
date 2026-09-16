import { describe, it, expect } from "vitest";
import { mandLijnen, somCenten, groepeerOpenBetalingen, momentLabel, momentenZin, MAX_MOMENTEN } from "./mand.js";
import { rekenMandAf, boekDeelterugbetalingen } from "./mand-afrekenen.js";

// ---------------------------------------------------------------------------------------------------------------
// Een nagebootste Supabase: elke query noteert wat er gevraagd werd en krijgt zijn antwoord van `antwoord(tabel, ops)`.
// ---------------------------------------------------------------------------------------------------------------
function nepAdmin(antwoord) {
  const log = [];
  const bouw = (tabel) => {
    const ops = [];
    const b = {
      then: (ok, nok) => Promise.resolve(antwoord(tabel, ops, log)).then(ok, nok),
    };
    for (const m of ["select", "eq", "in", "is", "not", "lt", "order", "limit", "update", "insert", "upsert", "single", "maybeSingle"]) {
      b[m] = (...args) => { ops.push([m, ...args]); if (["update", "insert", "upsert"].includes(m)) log.push({ tabel, m, args }); return b; };
    }
    return b;
  };
  return {
    log,
    from: (t) => bouw(t),
    rpc: (naam, args) => Promise.resolve(antwoord(`rpc:${naam}`, [["args", args]], log)),
  };
}
describe("wat elke sessie in een mand kost", () => {
  const rijen = [
    { id: "c", starts_at: "2026-09-24T17:00:00Z", price_cents: 1500 },
    { id: "a", starts_at: "2026-09-22T17:00:00Z", price_cents: 1500 },
    { id: "b", starts_at: "2026-09-23T17:00:00Z", price_cents: 1500 },
  ];

  it("zonder korting: elke sessie zijn eigen prijs, in volgorde van tijd", () => {
    const l = mandLijnen(rijen);
    expect(l.map((x) => x.booking_id)).toEqual(["a", "b", "c"]);
    expect(somCenten(l)).toBe(4500);
  });

  it("een kortingscode geldt voor ÉÉN sessie, niet voor de hele mand", () => {
    // Review #34: op het totaal toegepast gaf één eenmalige 100%-code acht gratis sessies.
    const l = mandLijnen(rijen, { codeId: "k", cents: 750 });
    expect(l.find((x) => x.korting).booking_id).toBe("a");
    expect(l.map((x) => x.charge_cents)).toEqual([750, 1500, 1500]);
    expect(somCenten(l)).toBe(3750);
  });

  it("een korting kan een sessie nooit méér laten kosten of onder nul brengen", () => {
    expect(mandLijnen(rijen, { codeId: "k", cents: 99999 })[0].charge_cents).toBe(1500);
    expect(mandLijnen(rijen, { codeId: "k", cents: -5 })[0].charge_cents).toBe(0);
  });

  it("de bovengrens staat vast op 8, dezelfde als in de databank", () => {
    expect(MAX_MOMENTEN).toBe(8);
  });
});

describe("de afrekenbanner op /account", () => {
  it("één blok per mand, met de som en de momenten — niet acht knoppen", () => {
    const g = groepeerOpenBetalingen([
      { id: "1", order_id: "O", created_at: "2026-09-13T10:00:00Z", price_cents: 1500, starts_at: "2026-09-22T17:00:00Z", services: { name: "Fit60" } },
      { id: "2", order_id: "O", created_at: "2026-09-13T10:00:00Z", price_cents: 1500, charge_cents: 750, starts_at: "2026-09-23T17:00:00Z" },
      { id: "3", order_id: null, created_at: "2026-09-13T10:05:00Z", price_cents: 1500, starts_at: "2026-09-25T17:00:00Z" },
    ]);
    expect(g).toHaveLength(2);
    const mand = g.find((x) => x.orderId === "O");
    expect(mand.price).toBe(2250); // charge_cents wint van price_cents
    expect(mand.momenten).toHaveLength(2);
    expect(mand.deadline).toBe("2026-09-13T10:15:00.000Z");
  });
});

describe("momenten als tekst", () => {
  it("in de tijd van de gym, zonder punten", () => {
    // 22 sep 17:00 UTC = 19:00 in Brussel (zomertijd).
    expect(momentLabel("2026-09-22T17:00:00Z")).toBe("di 22 sep 19:00");
  });
  it("een lange mand wordt ingekort met +n", () => {
    expect(momentenZin(["a", "b", "c", "d", "e", "f"], 4)).toBe("a · b · c · d · +2");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// De webhook: rekenMandAf
// ---------------------------------------------------------------------------------------------------------------
function scenario({ settle, nazorgGeclaimd = false, lijnen = [{ booking_id: "a", charge_cents: 1500 }, { booking_id: "b", charge_cents: 1500 }, { booking_id: "c", charge_cents: 1500 }], fouten = {} }) {
  const refunds = [];
  const bevestigingen = [];
  const meldingen = [];
  const admin = nepAdmin((tabel, ops) => {
    if (fouten[tabel]) return { error: { message: fouten[tabel] } };
    if (tabel === "booking_orders") return { data: { id: "O", gym_id: "G", user_id: "U", discount_code_id: null } };
    if (tabel === "booking_order_lines") return { data: lijnen };
    if (tabel === "rpc:settle_booking_order") return { data: settle };
    if (tabel === "bookings") return { data: lijnen.map((l, i) => ({ id: l.booking_id, gym_id: "G", user_id: "U", starts_at: `2026-09-2${2 + i}T17:00:00Z`, ends_at: `2026-09-2${2 + i}T18:00:00Z`, persons: 1, services: { name: "Fit60" } })) };
    if (tabel === "payments") return { data: { id: "P" } };
    if (tabel === "booking_order_settlements") return { data: nazorgGeclaimd ? [] : [{ session_id: "cs_1" }] };
    return { data: null };
  });
  const stripe = {
    refunds: {
      create: async (params, opts) => { refunds.push({ params, opts }); return { id: `re_${refunds.length}`, amount: params.amount, status: "succeeded" }; },
      list: async () => ({ data: [] }),
    },
  };
  const deps = {
    admin, stripe,
    stuurBevestiging: async (x) => bevestigingen.push(x),
    meldLid: async (...x) => meldingen.push(x),
    meldBeheer: async (...x) => meldingen.push(["beheer", ...x]),
  };
  return { deps, admin, refunds, bevestigingen, meldingen };
}
const sessie = (over = {}) => ({ id: "cs_1", payment_intent: "pi_1", amount_total: 4500, metadata: { kind: "booking_order", order_id: "O" }, ...over });

describe("een mand afrekenen in de webhook", () => {
  it("alles geldig: één betaalrij, geen terugbetaling, één mail met drie sessies", async () => {
    const s = scenario({ settle: { confirmed: ["a", "b", "c"], refund_booking_ids: [], refund_cents: 0, herhaald: false } });
    const uit = await rekenMandAf(s.deps, sessie());
    expect(uit.confirmed).toHaveLength(3);
    expect(s.refunds).toHaveLength(0);
    const betaal = s.admin.log.filter((l) => l.tabel === "payments");
    expect(betaal).toHaveLength(1);
    expect(betaal[0].args[0].amount_cents).toBe(4500);
    expect(betaal[0].args[0].order_id).toBe("O");
    expect(s.bevestigingen).toHaveLength(1);
    expect(s.bevestigingen[0].sessies).toHaveLength(3);
  });

  it("één moment vervallen: exact dat bedrag terug, met de sessie als idempotentiesleutel", async () => {
    const s = scenario({ settle: { confirmed: ["a", "b"], refund_booking_ids: ["c"], refund_cents: 1500, herhaald: false } });
    await rekenMandAf(s.deps, sessie());
    expect(s.refunds).toHaveLength(1);
    expect(s.refunds[0].params.amount).toBe(1500);
    expect(s.refunds[0].params.metadata.reden).toBe("vervallen");
    expect(s.refunds[0].opts.idempotencyKey).toBe("mand-refund:cs_1");
    // De betaalrij komt VÓÓR de terugbetaling (review #17, #31), en de terugbetaling is een negatieve rij.
    const pay = s.admin.log.filter((l) => l.tabel === "payments").map((l) => l.args[0].amount_cents);
    expect(pay).toEqual([4500, -1500]);
    expect(s.bevestigingen[0].teruggestortCents).toBe(1500);
  });

  it("tweede betaling voor een al betaalde mand: alles terug, GEEN betaalrij, geen mail", async () => {
    // Review #1: dit was precies het geval waarin € 45 stil bleef staan.
    const s = scenario({ settle: { confirmed: [], refund_booking_ids: ["a", "b", "c"], refund_cents: 4500, herhaald: false } });
    await rekenMandAf(s.deps, sessie());
    expect(s.refunds[0].params.amount).toBe(4500);
    expect(s.refunds[0].params.metadata.reden).toBe("dubbel");
    // Geen positieve rij, dus ook geen negatieve: anders zakt de omzet € 45 onder nul.
    expect(s.admin.log.some((l) => l.tabel === "payments")).toBe(false);
    expect(s.bevestigingen).toHaveLength(0);
  });

  it("een herhaalde aflevering stuurt geen tweede mail en geen tweede terugbetaling", async () => {
    const s = scenario({ settle: { confirmed: ["a", "b"], refund_booking_ids: ["c"], refund_cents: 1500, refund_id: "re_al", herhaald: true }, nazorgGeclaimd: true });
    await rekenMandAf(s.deps, sessie());
    expect(s.refunds).toHaveLength(0);
    expect(s.bevestigingen).toHaveLength(0);
  });

  it("minder ontvangen dan de sessie aanrekende: niets afrekenen, alles terug, beheer verwittigd", async () => {
    const s = scenario({ settle: null });
    const uit = await rekenMandAf(s.deps, sessie({ amount_total: 3000 }));
    expect(uit.confirmed).toEqual([]);
    expect(s.refunds[0].params.amount).toBeUndefined(); // volledige PI
    expect(s.admin.log.some((l) => l.tabel === "payments")).toBe(false);
    expect(s.meldingen.some((m) => m[0] === "beheer")).toBe(true);
  });

  it("een databankfout GOOIT, zodat Stripe het event opnieuw aflevert", async () => {
    // Supabase gooit zelf niet. Een ontbrekende `if (error)` was een half verwerkte betaling (review #4).
    const s = scenario({ settle: { confirmed: ["a"], refund_booking_ids: [], refund_cents: 0 }, fouten: { payments: "boem" } });
    await expect(rekenMandAf(s.deps, sessie())).rejects.toThrow(/betaalrij mand/);
  });

  it("zonder mandlijnen wordt er niets bevestigd — de sessie is niet toe te wijzen", async () => {
    const s = scenario({ settle: null, lijnen: [] });
    await expect(rekenMandAf(s.deps, sessie())).rejects.toThrow(/geen mandlijnen/);
  });
});

describe("een deelterugbetaling boeken", () => {
  it("boekt negatieve rijen en annuleert NIETS", async () => {
    const admin = nepAdmin((tabel) => {
      if (tabel === "bookings") return { data: { gym_id: "G", user_id: "U", order_id: "O", stripe_session_id: "cs_1" } };
      if (tabel === "payments") return { data: { status: "betaald" } };
      return { data: null };
    });
    const stripe = { refunds: { list: async () => ({ data: [{ id: "re_9", amount: 1500, status: "succeeded", metadata: { booking_id: "b", reden: "annulering" } }] }) } };
    const uit = await boekDeelterugbetalingen({ admin, stripe }, { payment_intent: "pi_1" });
    expect(uit).toEqual({ geboekt: 1, zonderHerkomst: 0 });
    expect(admin.log.some((l) => l.tabel === "bookings")).toBe(false);
    const rij = admin.log.find((l) => l.tabel === "payments").args[0];
    expect(rij.amount_cents).toBe(-1500);
    expect(rij.status).toBe("betaald");
  });

  it("staat de oorspronkelijke betaling al op refunded, dan telt de negatieve rij ook niet mee", async () => {
    // Stripe levert events niet op volgorde: de volledige terugbetaling kan eerst binnenkomen.
    const admin = nepAdmin((tabel) => {
      if (tabel === "bookings") return { data: { gym_id: "G", user_id: "U", order_id: "O", stripe_session_id: "cs_1" } };
      if (tabel === "payments") return { data: { status: "refunded" } };
      return { data: null };
    });
    const stripe = { refunds: { list: async () => ({ data: [{ id: "re_9", amount: 1500, status: "succeeded", metadata: { kind: "booking_order" } }] }) } };
    await boekDeelterugbetalingen({ admin, stripe }, { payment_intent: "pi_1" });
    expect(admin.log.find((l) => l.tabel === "payments").args[0].status).toBe("refunded");
  });

  it("een terugbetaling die niet van ons komt (dashboard), wordt geteld zodat beheer ze ziet", async () => {
    const admin = nepAdmin((tabel) => (tabel === "bookings" ? { data: { gym_id: "G", user_id: "U", order_id: null, stripe_session_id: null } } : { data: null }));
    const stripe = { refunds: { list: async () => ({ data: [{ id: "re_x", amount: 500, status: "succeeded", metadata: {} }] }) } };
    const uit = await boekDeelterugbetalingen({ admin, stripe }, { payment_intent: "pi_1" });
    expect(uit.zonderHerkomst).toBe(1);
  });
});

describe("een kortingscode verbruiken", () => {
  // De code stond op sessie "a". Valt die weg, dan mag hij NIET opgebrand worden aan een andere sessie.
  const bouw = (confirmed) => {
    const lijnen = [{ booking_id: "a", charge_cents: 0 }, { booking_id: "b", charge_cents: 1500 }];
    const geregistreerd = [];
    const admin = nepAdmin((tabel) => {
      if (tabel === "booking_orders") return { data: { id: "O", gym_id: "G", user_id: "U", discount_code_id: "K" } };
      if (tabel === "booking_order_lines") return { data: lijnen };
      if (tabel === "rpc:settle_booking_order") return { data: { confirmed, refund_booking_ids: [], refund_cents: 0, herhaald: false } };
      if (tabel === "booking_order_settlements") return { data: [{ session_id: "cs_1" }] };
      if (tabel === "bookings") return { data: [
        { id: "a", gym_id: "G", user_id: "U", starts_at: "2026-09-22T17:00:00Z", ends_at: "2026-09-22T18:00:00Z", persons: 1, discount_code_id: "K", services: { name: "Fit60" } },
        { id: "b", gym_id: "G", user_id: "U", starts_at: "2026-09-23T17:00:00Z", ends_at: "2026-09-23T18:00:00Z", persons: 1, discount_code_id: null, services: { name: "Fit60" } },
      ] };
      return { data: null };
    });
    return { geregistreerd, deps: { admin, stripe: { refunds: { create: async () => ({ id: "re", amount: 0, status: "succeeded" }), list: async () => ({ data: [] }) } }, registreerKorting: async (...a) => geregistreerd.push(a), stuurBevestiging: async () => {} } };
  };

  it("de kortingsregel is bevestigd: de code wordt verbruikt op die sessie", async () => {
    const s = bouw(["a", "b"]);
    await rekenMandAf(s.deps, { id: "cs_1", payment_intent: "pi_1", amount_total: 1500, metadata: { kind: "booking_order", order_id: "O" } });
    expect(s.geregistreerd).toHaveLength(1);
    expect(s.geregistreerd[0][3]).toBe("a");
  });

  it("de kortingsregel viel weg: de code blijft ongebruikt", async () => {
    const s = bouw(["b"]);
    await rekenMandAf(s.deps, { id: "cs_1", payment_intent: "pi_1", amount_total: 1500, metadata: { kind: "booking_order", order_id: "O" } });
    expect(s.geregistreerd).toHaveLength(0);
  });
});

describe("een herhaalde aflevering van hetzelfde event", () => {
  it("claimt de nazorg niet nog eens: geen tweede mail", async () => {
    // Review #3/#6/#15: de poort staat op de claim, niet op `herhaald` — anders viel de mail voorgoed weg
    // wanneer de EERSTE aflevering na de settle crashte.
    const s = scenario({ settle: { confirmed: ["a", "b", "c"], refund_booking_ids: [], refund_cents: 0, herhaald: true }, nazorgGeclaimd: true });
    await rekenMandAf(s.deps, sessie());
    expect(s.bevestigingen).toHaveLength(0);
  });

  it("de eerste aflevering crashte ná de settle: de tweede mailt alsnog", async () => {
    const s = scenario({ settle: { confirmed: ["a", "b", "c"], refund_booking_ids: [], refund_cents: 0, herhaald: true } });
    await rekenMandAf(s.deps, sessie());
    expect(s.bevestigingen).toHaveLength(1);
  });
});
