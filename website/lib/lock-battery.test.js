import { describe, it, expect } from "vitest";
import { tierFor, decide } from "@/lib/lock-battery";

// De batterijwaarschuwing heeft twee faalwijzen die allebei stil zijn:
// elke dag opnieuw mailen (tot niemand het nog leest), of nooit vuren. Daarom hier getest.
const bat = (percent, extra = {}) => ({ ok: true, percent, critical: false, keypadCritical: false, ...extra });

describe("tierFor", () => {
  it("zwijgt boven de hoogste drempel", () => {
    expect(tierFor(60, false)).toBe(null);
    expect(tierFor(31, false)).toBe(null);
  });
  it("kiest de juiste trap", () => {
    expect(tierFor(30, false)).toBe(30);
    expect(tierFor(25, false)).toBe(30);
    expect(tierFor(20, false)).toBe(20);
    expect(tierFor(11, false)).toBe(20);
    expect(tierFor(10, false)).toBe(10);
    expect(tierFor(1, false)).toBe(10);
  });
  it("kritiek overstemt het percentage", () => {
    expect(tierFor(55, true)).toBe(0);
  });
  it("geen meting = geen oordeel", () => {
    expect(tierFor(null, false)).toBe(null);
  });
});

describe("decide", () => {
  it("mailt de eerste keer dat 30% geraakt wordt", () => {
    expect(decide(bat(28), null)).toMatchObject({ alert: true, newTier: 30 });
  });

  it("mailt NIET elke dag opnieuw op dezelfde trap — dit is de spam-guard", () => {
    expect(decide(bat(28), 30).alert).toBe(false);
    expect(decide(bat(24), 30).alert).toBe(false);
    expect(decide(bat(21), 30).alert).toBe(false);
  });

  it("mailt wél opnieuw zodra het een trap zakt", () => {
    expect(decide(bat(19), 30)).toMatchObject({ alert: true, newTier: 20 });
    expect(decide(bat(9), 20)).toMatchObject({ alert: true, newTier: 10 });
    expect(decide(bat(5, { critical: true }), 10)).toMatchObject({ alert: true, newTier: 0 });
  });

  it("zwijgt zodra kritiek al gemeld is", () => {
    expect(decide(bat(3, { critical: true }), 0).alert).toBe(false);
  });

  it("meldt een kritiek keypad ook als het slot zelf nog goed zit", () => {
    // Slot op 55% → geen trap, maar het keypad is dood en dan werkt geen enkele code.
    expect(decide(bat(55, { keypadCritical: true }), null)).toMatchObject({ alert: true, newTier: 0 });
  });

  it("herstart de reeks pas ná vervanging, met marge tegen schommelen rond de grens", () => {
    expect(decide(bat(32), 30).reset).toBe(false); // 32% = binnen de marge, nog geen nieuwe batterijen
    expect(decide(bat(36), 30).reset).toBe(true);  // ruim boven → duidelijk vervangen
    expect(decide(bat(90), null).reset).toBe(false); // niets te wissen
  });

  it("doet niets zonder meting", () => {
    expect(decide({ ok: true, percent: null, critical: false, keypadCritical: false }, null))
      .toMatchObject({ alert: false, reset: false });
  });
});
