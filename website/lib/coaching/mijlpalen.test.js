import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const lees = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
import { bepaalMijlpalen, zwaarste, wekenOpRij, MIJLPALEN, volgendeMijlpaal } from "./mijlpalen.js";

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

describe("waar je naartoe werkt", () => {
  // Klacht 6 uit de brief: modules die je aanzette zijn onzichtbaar tot er toevallig iets bestaat.
  // Wie Motivatie koos, zag NIETS tot er een mijlpaal gehaald was. Tegelijk geldt "leeg is
  // onzichtbaar", dus het antwoord is geen leeg vak maar een doel.

  it("wijst een kersvers plan naar de eerste sessie", () => {
    expect(volgendeMijlpaal({ afgevinkt: 0, wekenAf: 0, planWeken: 8, opRij: 0 }))
      .toMatchObject({ soort: "eerste_sessie", nog: "nog 1 sessie" });
  });

  it("schuift op zodra er iets gehaald is", () => {
    expect(volgendeMijlpaal({ afgevinkt: 1, wekenAf: 0, planWeken: 8, opRij: 0 }).soort).toBe("eerste_week");
    expect(volgendeMijlpaal({ afgevinkt: 3, wekenAf: 1, planWeken: 8, opRij: 1 }))
      .toMatchObject({ soort: "tien_sessies", nog: "nog 7 sessies" });
  });

  it("gaat op rang, van licht naar zwaar — niet wat er over twee maanden komt", () => {
    // Een doel dat buiten bereik ligt, motiveert niemand.
    expect(volgendeMijlpaal({ afgevinkt: 0, wekenAf: 0, planWeken: 12, opRij: 0 }).soort).toBe("eerste_sessie");
  });

  it("slaat halfweg over bij een kort plan — net als bepaalMijlpalen", () => {
    // Bij drie weken valt "halfweg" samen met "je eerste week is rond"; dat vier je niet twee keer.
    const v = volgendeMijlpaal({ afgevinkt: 12, wekenAf: 1, planWeken: 3, opRij: 1 });
    expect(v.soort).not.toBe("halfweg");
  });

  it("telt enkelvoud en meervoud correct — 'nog 1 sessies' leest als een bug", () => {
    expect(volgendeMijlpaal({ afgevinkt: 9, wekenAf: 1, planWeken: 8, opRij: 1 }).nog).toBe("nog 1 sessie");
    expect(volgendeMijlpaal({ afgevinkt: 0, wekenAf: 0, planWeken: 8, opRij: 0 }).nog).toBe("nog 1 sessie");
  });

  it("zwijgt wanneer alles gehaald is", () => {
    expect(volgendeMijlpaal({ afgevinkt: 26, wekenAf: 8, planWeken: 8, opRij: 8 })).toBeNull();
  });

  it("noemt alleen mijlpalen die echt bestaan", () => {
    for (const stand of [
      { afgevinkt: 0, wekenAf: 0, planWeken: 6, opRij: 0 },
      { afgevinkt: 11, wekenAf: 2, planWeken: 6, opRij: 2 },
      { afgevinkt: 20, wekenAf: 5, planWeken: 6, opRij: 5 },
    ]) {
      const v = volgendeMijlpaal(stand);
      if (v) expect(MIJLPALEN[v.soort]).toBeTruthy();
    }
  });

  it("het blok hangt aan de motivatiemodule, niet aan het bestaan van een mijlpaal", () => {
    // Anders is de module weer onzichtbaar voor precies wie er het meest aan heeft: de beginner.
    const p = lees("app/(site)/coaching/page.jsx");
    expect(p).toMatch(/\{motivatie && \(mijlpalen\.length > 0 \|\| volgende\)/);
    expect(p).toMatch(/includes\("motivatie"\)/);
  });
});

describe("de reeks volle weken telt alleen weken die voorbij zijn", () => {
  // De fout die dit dicht: een plan van acht weken heeft vanaf dag één acht weekrijen, maar
  // coaching_sessions ontstaan pas als een week opengaat. Wie de hele planlengte in `volledig`
  // stopte, kreeg [T,T,T,F,F,F,F,F] — en omdat wekenOpRij vanaf het EINDE telt, was het antwoord
  // altijd 0. De mijlpaal "drie volle weken op rij" heeft daardoor nooit kunnen vuren.

  it("toont de fout: nog niet geopende weken maken de reeks 0", () => {
    expect(wekenOpRij([true, true, true, false, false, false, false, false])).toBe(0);
  });

  it("en telt wél correct wanneer je alleen de afgeronde weken meegeeft", () => {
    expect(wekenOpRij([true, true, true])).toBe(3);
    expect(bepaalMijlpalen({ afgevinkt: 9, wekenAf: 3, planWeken: 8, opRij: 3 })).toContain("drie_op_rij");
  });

  it("dossierVoor geeft alleen afgeronde weken door", () => {
    // De plek waar het misging. Zonder deze filter stond er op /coaching een doel dat nooit
    // dichterbij kwam, wat erger is dan het blok helemaal niet tonen.
    expect(lees("lib/coaching/plan.js")).toMatch(/const voorbij = \(weken \|\| \[\]\)\.filter\(\(w\) => w\.completed_at\)/);
  });

  it("de cron doet hetzelfde, anders wordt de mijlpaal nooit gemaild", () => {
    expect(lees("app/api/cron/coaching/route.js")).toMatch(/completed_at/);
  });
});
