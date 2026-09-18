import { describe, it, expect } from "vitest";
import { vorigeSessie, netheidsScore, magInchecken, weekTrend, tweeKeerRommel, uurband } from "./netheid.js";
import { nieuweBadges, volgendeBadge, sessieStats } from "./badges.js";

describe("wie zat er vóór je?", () => {
  const deze = { id: "z", user_id: "u1", starts_at: "2026-09-24T15:00:00Z" }; // 17:00 Brussel
  it("de laatste sessie die vóór jou eindigde, dezelfde dag", () => {
    const v = vorigeSessie(deze, [
      { id: "a", user_id: "u2", ends_at: "2026-09-24T12:00:00Z" },
      { id: "b", user_id: "u3", ends_at: "2026-09-24T14:00:00Z" },
    ]);
    expect(v).toEqual({ booking: "b", kind: "lid", user: "u3" });
  });
  it("een gat van meer dan 3 uur: niemand", () => {
    expect(vorigeSessie(deze, [{ id: "a", user_id: "u2", ends_at: "2026-09-24T11:00:00Z" }])).toBe(null);
  });
  it("jijzelf (meerdere uren na elkaar): niemand anders aanwijzen", () => {
    expect(vorigeSessie(deze, [{ id: "a", user_id: "u1", ends_at: "2026-09-24T15:00:00Z" }])).toMatchObject({ kind: "eigen", user: null });
  });
  it("een PT-sessie: de coach, niet de klant", () => {
    expect(vorigeSessie(deze, [{ id: "a", user_id: "klant", coach_id: "coach", ends_at: "2026-09-24T14:30:00Z" }]))
      .toEqual({ booking: "a", kind: "pt", user: "coach" });
  });
  it("de avond ervoor telt niet", () => {
    expect(vorigeSessie({ ...deze, starts_at: "2026-09-24T05:00:00Z" }, [{ id: "a", user_id: "u2", ends_at: "2026-09-23T21:00:00Z" }])).toBe(null);
  });
});

describe("netheidsscore", () => {
  const nu = Date.parse("2026-09-30T12:00:00Z");
  const c = (state, extra = {}) => ({ state, created_at: "2026-09-25T12:00:00Z", ...extra });
  it("te weinig checks: geen kleur", () => {
    expect(netheidsScore([c("rommel"), c("rommel")], nu).kleur).toBe(null);
  });
  it("twee bevestigde rommels in 30 dagen: rood", () => {
    expect(netheidsScore([c("rommel", { photo_path: "x" }), c("rommel", { owner_verdict: "terecht" }), c("netjes")], nu).kleur).toBe("rood");
  });
  it("mostly netjes: groen; onterecht telt niet", () => {
    expect(netheidsScore([c("netjes"), c("netjes"), c("rommel", { owner_verdict: "onterecht" })], nu)).toMatchObject({ kleur: "groen", score: 2 });
  });
  it("stuk telt niet mee en ouder dan 90 dagen ook niet", () => {
    expect(netheidsScore([c("stuk"), c("rommel", { created_at: "2026-05-01T00:00:00Z" })], nu).aantal).toBe(0);
  });
});

describe("inchecken", () => {
  const b = { status: "bevestigd", starts_at: "2026-09-24T15:00:00Z", ends_at: "2026-09-24T16:00:00Z" };
  it("van 10 min vóór tot 2 uur na", () => {
    expect(magInchecken(b, Date.parse("2026-09-24T14:49:00Z"))).toBe(false);
    expect(magInchecken(b, Date.parse("2026-09-24T14:51:00Z"))).toBe(true);
    expect(magInchecken(b, Date.parse("2026-09-24T17:59:00Z"))).toBe(true);
    expect(magInchecken(b, Date.parse("2026-09-24T18:01:00Z"))).toBe(false);
    expect(magInchecken({ ...b, status: "geannuleerd" }, Date.parse("2026-09-24T15:10:00Z"))).toBe(false);
  });
});

describe("trend en alarm", () => {
  it("% netjes per week, 'stuk' telt niet", () => {
    const t = weekTrend([
      { state: "netjes", created_at: "a" }, { state: "rommel", created_at: "a" }, { state: "netjes", created_at: "a" }, { state: "stuk", created_at: "a" },
    ], () => "2026-W39");
    expect(t).toEqual([{ week: "2026-W39", netjes: 2, totaal: 3, pct: 67, teWeinig: false }]);
  });
  it("twee keer rommel na elkaar", () => {
    expect(tweeKeerRommel([{ state: "rommel" }, { state: "rommel" }])).toBe(true);
    expect(tweeKeerRommel([{ state: "rommel" }, { state: "netjes" }])).toBe(false);
  });
  it("uurband in Brussel", () => {
    expect(uurband("2026-09-24T05:00:00Z")).toBe("ochtend");
    expect(uurband("2026-09-24T12:00:00Z")).toBe("middag");
    expect(uurband("2026-09-24T17:00:00Z")).toBe("avond");
  });
});

describe("badges", () => {
  it("nieuw verdiende badges, zonder de al behaalde", () => {
    expect(nieuweBadges({ sessies: 12 }, new Set(["sessie_1"]))).toEqual(["sessie_10"]);
    expect(nieuweBadges({ omgezet: 3 })).toEqual(["ambassadeur_1", "ambassadeur_3"]);
  });
  it("de dichtstbijzijnde badge", () => {
    expect(volgendeBadge({ sessies: 23, zaalchecks: 1 }, new Set(["sessie_1", "sessie_10"]))).toMatchObject({ id: "sessie_25", nog: 2 });
  });
  it("vroeg, laat en rustig in Brussel", () => {
    expect(sessieStats([
      { starts_at: "2026-09-24T05:00:00Z" }, // 07:00
      { starts_at: "2026-09-24T19:30:00Z", promo: "rustig" }, // 21:30
    ])).toEqual({ sessies: 2, vroeg: 1, laat: 1, rustig: 1 });
  });
});
