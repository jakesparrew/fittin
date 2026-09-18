import { describe, it, expect } from "vitest";
import {
  WAARDEN, waarde, tellers, niveauVan, factor, bereken, isoWeek, vorigeWeek, reeks, questStatus,
  klasseVan, promoVoor, betaaldeUren, dowUur, klassement, gymdoel,
} from "./punten.js";

describe("waarden", () => {
  it("de standaard, tenzij de gym een eigen waarde zette", () => {
    expect(waarde(null, "sessie")).toBe(10);
    expect(waarde({ waarden: { sessie: 12 } }, "sessie")).toBe(12);
    expect(waarde({ waarden: { sessie: 0 } }, "sessie")).toBe(0); // 0 = actie uit
    expect(waarde({ waarden: { sessie: "" } }, "sessie")).toBe(10);
  });
  it("een gratis sessie blijft ongeveer 20 sessies trainen voor een vaste klant", () => {
    // 10 per sessie + weekpunten; 300 per gratis sessie. Wie dit verandert, verandert de korting.
    expect(WAARDEN.sessie).toBe(10);
  });
});

describe("de twee tellers", () => {
  const rijen = [
    { kind: "sessie", points: 10, created_at: "2026-09-01T10:00:00Z" },
    { kind: "sessie", points: 10, created_at: "2026-09-20T10:00:00Z" },
    { kind: "scorebord", points: 50, created_at: "2026-09-21T10:00:00Z" },
    { kind: "inwissel", points: -300, created_at: "2026-09-22T10:00:00Z" },
    { kind: "correctie", points: -10, created_at: "2026-09-23T10:00:00Z" },
  ];
  it("inwisselen raakt het saldo, niet het niveau", () => {
    const t = tellers(rijen);
    expect(t.saldo).toBe(-240);
    expect(t.lifetime).toBe(60);
  });
  it("het klassement telt geen scorebordbonus en geen uitgaven", () => {
    expect(tellers(rijen, { sinds: "2026-09-15T00:00:00Z" }).klassement).toBe(0); // 10 − 10 correctie
  });
});

describe("niveaus", () => {
  it("drempels en voortgang", () => {
    expect(niveauVan(0).naam).toBe("Starter");
    expect(niveauVan(249).naam).toBe("Starter");
    expect(niveauVan(250).naam).toBe("Regular");
    expect(niveauVan(500)).toMatchObject({ naam: "Regular", nogNodig: 250, pct: 50 });
    expect(niveauVan(99999)).toMatchObject({ naam: "Legende", volgend: null, pct: 100 });
  });
  it("vanaf Vaste klant 10 % extra, en een rustig uur telt dubbel", () => {
    expect(factor(749)).toBe(1);
    expect(factor(750)).toBe(1.1);
    expect(bereken(10, { lifetime: 0 })).toBe(10);
    expect(bereken(10, { lifetime: 800 })).toBe(11);
    expect(bereken(10, { lifetime: 0, rustig: true })).toBe(20);
    expect(bereken(10, { lifetime: 800, rustig: true })).toBe(22);
  });
});

describe("weken in Brussel", () => {
  it("ISO-week, ook rond middernacht en de jaarwissel", () => {
    expect(isoWeek("2026-09-18T10:00:00Z")).toBe("2026-W38");
    // zondag 20/09 23:30 in Brussel = 21:30 UTC → nog week 38
    expect(isoWeek("2026-09-20T21:30:00Z")).toBe("2026-W38");
    // maandag 21/09 00:30 in Brussel = zondag 22:30 UTC → al week 39
    expect(isoWeek("2026-09-20T22:30:00Z")).toBe("2026-W39");
    expect(isoWeek("2027-01-01T12:00:00Z")).toBe("2026-W53");
    expect(vorigeWeek("2026-W38")).toBe("2026-W37");
    expect(vorigeWeek("2027-W01")).toBe("2026-W53");
  });
});

describe("weken op rij", () => {
  const w = (...n) => new Set(n.map((x) => `2026-W${String(x).padStart(2, "0")}`));
  it("telt aaneengesloten weken tot de laatst afgesloten week", () => {
    expect(reeks(w(35, 36, 37, 38), "2026-W38").lengte).toBe(4);
    expect(reeks(w(35, 36, 38), "2026-W38")).toMatchObject({ lengte: 3, pauzes: ["2026-W37"] });
  });
  it("één pauze per 8 weken — twee missers vlak na elkaar breken de reeks", () => {
    expect(reeks(w(30, 32, 34), "2026-W34").lengte).toBe(2);
  });
  it("de laatste week gemist maar daarvoor een reeks: pauze, de reeks blijft", () => {
    expect(reeks(w(35, 36, 37), "2026-W38")).toMatchObject({ lengte: 3, pauzes: ["2026-W38"] });
  });
  it("nooit getraind = 0", () => {
    expect(reeks(new Set(), "2026-W38").lengte).toBe(0);
  });
});

describe("de starter-quest", () => {
  const start = "2026-09-18T12:00:00Z";
  it("wat vóór de lancering gebeurde, is gehaald maar levert geen punten op", () => {
    const q = questStatus({
      sessies: [{ starts_at: "2026-09-01T17:00:00Z" }, { starts_at: "2026-09-20T17:00:00Z" }],
      geboektOp: "2026-08-30T10:00:00Z", gestartOp: start,
    });
    const s = Object.fromEntries(q.map((x) => [x.id, x]));
    expect(s.eerste).toMatchObject({ gehaald: true, punten: false });
    // 2e sessie 19 dagen na de eerste: te laat voor de "binnen 14 dagen"-stap
    expect(s.tweede.gehaald).toBe(false);
  });
  it("een nieuw lid dat snel terugkomt, haalt de stappen mét punten", () => {
    const q = questStatus({
      sessies: [{ starts_at: "2026-09-20T17:00:00Z" }, { starts_at: "2026-09-25T17:00:00Z" }, { starts_at: "2026-10-10T17:00:00Z" }],
      geboektOp: "2026-09-19T10:00:00Z", profielOp: "2026-09-19T10:00:00Z", bronOp: "2026-09-21T10:00:00Z", gestartOp: start,
    });
    expect(q.every((x) => x.gehaald && x.punten)).toBe(true);
  });
});

describe("rustige uren", () => {
  it("klasse op 8 weken", () => {
    expect(klasseVan(0)).toBe("rustig");
    expect(klasseVan(2)).toBe("rustig");
    expect(klasseVan(3)).toBe("normaal");
    expect(klasseVan(5)).toBe("druk");
  });
  const nu = Date.parse("2026-09-18T10:00:00Z");
  const over = (u) => nu + u * 3600000;
  it("dezelfde regel als slot_promo() in de databank", () => {
    expect(promoVoor({ klasse: "rustig" }, over(72), nu)).toBe("rustig");
    expect(promoVoor({ klasse: "druk" }, over(2), nu)).toBe(null); // druk: ook last minute niet
    expect(promoVoor({ klasse: "normaal" }, over(2), nu)).toBe("rustig"); // last minute
    expect(promoVoor({ klasse: "normaal" }, over(30), nu)).toBe(null);
    expect(promoVoor(null, over(2), nu)).toBe("rustig");
    expect(promoVoor({ klasse: "rustig", pin: "nooit" }, over(2), nu)).toBe(null);
    expect(promoVoor({ klasse: "druk", pin: "altijd" }, over(72), nu)).toBe("rustig");
    expect(promoVoor({ klasse: "rustig" }, over(72), nu, { aan: false })).toBe(null);
  });
  it("2 uur voor de prijs van 1, pas vanaf 2 uur", () => {
    expect(betaaldeUren(1, "rustig")).toBe(1);
    expect(betaaldeUren(2, "rustig")).toBe(1);
    expect(betaaldeUren(3, "rustig")).toBe(2);
    expect(betaaldeUren(2, null)).toBe(2);
  });
  it("dag en uur in Brussel", () => {
    expect(dowUur("2026-09-21T16:00:00Z")).toEqual({ dow: 1, hour: 18 }); // maandag 18:00
    expect(dowUur("2026-09-20T22:30:00Z")).toEqual({ dow: 1, hour: 0 });
  });
});

describe("klassement", () => {
  const perLid = new Map([
    ["a", { naam: "An", deze: 120, vorige: 110, sessies: 8, aangebracht: 0 }],
    ["b", { naam: "Bo", deze: 90, vorige: 10, sessies: 5, aangebracht: 2 }],
    ["c", { naam: "Cas", deze: 60, vorige: 0, sessies: 3, aangebracht: 1 }],
    ["d", { naam: "Dirk", deze: 0, vorige: 50, sessies: 0, aangebracht: 0 }],
  ]);
  it("top op punten, meest verbeterd met minstens 4 sessies, beste aanbrenger", () => {
    const k = klassement(perLid);
    expect(k.top.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(k.verbeterd.id).toBe("b"); // c verbeterde meer (+60) maar had maar 3 sessies
    expect(k.aanbrenger.id).toBe("b");
  });
  it("gymdoel = 110 % van vorige maand, minstens 20", () => {
    expect(gymdoel(126)).toBe(140);
    expect(gymdoel(5)).toBe(20);
  });
});
