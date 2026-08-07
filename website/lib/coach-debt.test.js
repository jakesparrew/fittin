import { describe, it, expect } from "vitest";
import { aggregateDebts, debtReasons } from "./coach-debt.js";

// Vaste gegevens die het échte incident nabootsen. De bedragen komen overeen met de situatie van
// 2026-08-06: Jan Matthys 8 sessies op factuur (€ 96), Thomas een onbetaalde factuur (€ 120),
// Jean Francois een tegoed van -1 (€ 12).
const sessie = (coach_id, i) => ({ id: `b${i}`, coach_id, starts_at: `2026-07-${String(i).padStart(2, "0")}T10:00:00Z`, coach_charge_cents: 1200 });

describe("aggregateDebts", () => {
  it("telt nog te factureren sessies op tot het juiste bedrag", () => {
    const r = aggregateDebts({ bookings: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => sessie("jan", i)) });
    expect(r.get("jan").factuurSessies).toBe(8);
    expect(r.get("jan").factuurCents).toBe(9600);
    expect(r.get("jan").totaalCents).toBe(9600);
  });

  it("telt een onbetaalde factuurpost mee", () => {
    const r = aggregateDebts({ payments: [{ user_id: "thomas", amount_cents: 12000 }] });
    expect(r.get("thomas").openPostCents).toBe(12000);
    expect(r.get("thomas").totaalCents).toBe(12000);
  });

  it("rekent een negatief tegoedsaldo om naar euro's", () => {
    const r = aggregateDebts({ ledger: [{ coach_id: "jf", delta: -1 }] });
    expect(r.get("jf").saldo).toBe(-1);
    expect(r.get("jf").negatiefCents).toBe(1200);
  });

  it("telt een positief saldo NIET als schuld", () => {
    const r = aggregateDebts({ ledger: [{ coach_id: "jelle", delta: 10 }, { coach_id: "jelle", delta: -3 }] });
    expect(r.get("jelle").saldo).toBe(7);
    expect(r.get("jelle").negatiefCents).toBe(0);
    expect(r.get("jelle").totaalCents).toBe(0);
  });

  it("stapelt de drie mechanismen op voor dezelfde coach", () => {
    const r = aggregateDebts({
      bookings: [sessie("x", 1)],
      payments: [{ user_id: "x", amount_cents: 12000 }],
      ledger: [{ coach_id: "x", delta: -2 }],
    });
    expect(r.get("x").totaalCents).toBe(1200 + 12000 + 2400);
    expect(debtReasons(r.get("x"))).toEqual([
      "1 sessie nog te factureren",
      "factuur verstuurd, nog niet betaald",
      "tegoed staat -2 in de min",
    ]);
  });

  // DE REGRESSIE. Dit is precies wat er misging: alle coaches werden op modus 'credit' gezet, en de
  // schermen toonden "te factureren" alleen wanneer het PROFIEL nog op 'invoice' stond. Daardoor
  // verdween € 156 aan echte schuld uit beeld en las een coach met openstaande sessies als
  // "Saldo: 0". De berekening mag dus nooit naar de profielinstelling kijken — enkel naar de
  // boekingen zelf. Een coach met saldo 0 én openstaande factuursessies moet schuld tonen.
  it("toont schuld ook als het tegoedsaldo netjes op 0 staat (profielmodus is irrelevant)", () => {
    const r = aggregateDebts({
      bookings: [sessie("jan", 1), sessie("jan", 2)],
      ledger: [{ coach_id: "jan", delta: 0 }],
    });
    expect(r.get("jan").saldo).toBe(0);
    expect(r.get("jan").totaalCents).toBe(2400);
  });

  it("houdt halve sessies correct (tegoed is numeric, 1,5 bestaat)", () => {
    const r = aggregateDebts({ ledger: [{ coach_id: "h", delta: -1.5 }] });
    expect(r.get("h").negatiefCents).toBe(1800);
  });

  it("geeft niets terug wanneer er nergens schuld is", () => {
    expect(aggregateDebts({}).size).toBe(0);
  });
});
