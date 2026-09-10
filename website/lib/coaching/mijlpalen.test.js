import { describe, it, expect } from "vitest";
import { bepaalMijlpalen, zwaarste, wekenOpRij, MIJLPALEN } from "./mijlpalen.js";

describe("welke mijlpalen bereikt zijn", () => {
  it("geeft niets terug bij een leeg dossier", () => {
    expect(bepaalMijlpalen({})).toEqual([]);
  });

  it("viert de eerste sessie", () => {
    expect(bepaalMijlpalen({ afgevinkt: 1 })).toEqual(["eerste_sessie"]);
  });

  it("viert de eerste afgeronde week", () => {
    const m = bepaalMijlpalen({ afgevinkt: 3, wekenAf: 1, planWeken: 8 });
    expect(m).toContain("eerste_week");
    expect(m).not.toContain("halfweg");
  });

  it("telt halfweg vanaf de helft, naar boven afgerond", () => {
    expect(bepaalMijlpalen({ wekenAf: 3, planWeken: 8 })).not.toContain("halfweg");
    expect(bepaalMijlpalen({ wekenAf: 4, planWeken: 8 })).toContain("halfweg");
    expect(bepaalMijlpalen({ wekenAf: 3, planWeken: 6 })).toContain("halfweg");
  });

  it("viert bij een heel kort plan niet twee keer hetzelfde moment", () => {
    // Bij drie weken valt "halfweg" samen met "je eerste week is rond".
    const m = bepaalMijlpalen({ wekenAf: 2, planWeken: 3 });
    expect(m).toContain("eerste_week");
    expect(m).not.toContain("halfweg");
  });

  it("kent de sessiedrempels", () => {
    expect(bepaalMijlpalen({ afgevinkt: 9 })).not.toContain("tien_sessies");
    expect(bepaalMijlpalen({ afgevinkt: 10 })).toContain("tien_sessies");
    expect(bepaalMijlpalen({ afgevinkt: 24 })).not.toContain("vijfentwintig_sessies");
    expect(bepaalMijlpalen({ afgevinkt: 25 })).toContain("vijfentwintig_sessies");
  });

  it("vraagt drie volle weken op rij, niet drie weken", () => {
    expect(bepaalMijlpalen({ opRij: 2 })).not.toContain("drie_op_rij");
    expect(bepaalMijlpalen({ opRij: 3 })).toContain("drie_op_rij");
  });

  it("sluit af wanneer alle weken rond zijn", () => {
    expect(bepaalMijlpalen({ wekenAf: 8, planWeken: 8 })).toContain("plan_af");
    expect(bepaalMijlpalen({ wekenAf: 7, planWeken: 8 })).not.toContain("plan_af");
  });

  it("geeft nooit een soort terug die geen tekst heeft", () => {
    const alles = bepaalMijlpalen({ afgevinkt: 40, wekenAf: 12, planWeken: 12, opRij: 12 });
    for (const s of alles) expect(MIJLPALEN[s], `${s} mist een tekst`).toBeTruthy();
  });
});

describe("de zwaarste kiezen", () => {
  it("kiest de hoogste rang, niet de eerste", () => {
    expect(zwaarste(["eerste_sessie", "plan_af", "eerste_week"]).soort).toBe("plan_af");
  });
  it("negeert onbekende soorten", () => {
    expect(zwaarste(["verzonnen", "eerste_week"]).soort).toBe("eerste_week");
    expect(zwaarste(["verzonnen"])).toBe(null);
    expect(zwaarste([])).toBe(null);
    expect(zwaarste(null)).toBe(null);
  });
  it("levert de tekst mee", () => {
    expect(zwaarste(["halfweg"]).titel).toBe(MIJLPALEN.halfweg.titel);
  });
});

describe("weken op rij", () => {
  it("telt vanaf het einde en stopt bij het eerste gat", () => {
    expect(wekenOpRij([true, false, true, true, true])).toBe(3);
    expect(wekenOpRij([true, true, false])).toBe(0);
    expect(wekenOpRij([])).toBe(0);
    expect(wekenOpRij(null)).toBe(0);
  });
});
