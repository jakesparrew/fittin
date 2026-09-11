import { describe, it, expect } from "vitest";
import { groeiendeTekst, afgewerkteObjecten, uitPlan, uitMenu } from "./stroomlezer.js";

// Deze lezers krijgen JSON te zien die nog niet af is. Dat is geen randgeval maar de normale
// toestand: ze draaien tientallen keren per antwoord, en elke keer op een tekst die midden in een
// woord ophoudt. De enige regel die telt is dat ze niets verzinnen — liever niets terug dan een
// halve dag die er niet staat.

const MENU_HALF = `{
  "toelichting": "Dit menu mikt op ongeveer 2.100 kcal per dag en houdt`;

const MENU_EEN_DAG = `{
  "toelichting": "Twee zinnen uitleg.",
  "dagen": [
    { "ontbijt": "Havermout met banaan", "lunch": "Kipwrap", "avondeten": "Zalm met rijst", "tussendoor": "Yoghurt" },
    { "ontbijt": "Eieren op toast`;

describe("een zin die nog geschreven wordt", () => {
  it("geeft terug wat er nu staat, en zegt dat hij nog niet af is", () => {
    const r = groeiendeTekst(MENU_HALF, "toelichting");
    expect(r.af).toBe(false);
    expect(r.tekst).toBe("Dit menu mikt op ongeveer 2.100 kcal per dag en houdt");
  });

  it("herkent het sluitende aanhalingsteken", () => {
    expect(groeiendeTekst(MENU_EEN_DAG, "toelichting")).toEqual({ tekst: "Twee zinnen uitleg.", af: true });
  });

  it("trapt niet in een aanhalingsteken dat ontsnapt is", () => {
    const s = '{ "toelichting": "Een \\"stevig\\" ontbijt.", "dagen": []}';
    expect(groeiendeTekst(s, "toelichting")).toEqual({ tekst: 'Een "stevig" ontbijt.', af: true });
  });

  it("geeft niets terug voor een sleutel die er nog niet is", () => {
    expect(groeiendeTekst('{ "toel', "toelichting")).toBe(null);
    expect(groeiendeTekst("", "toelichting")).toBe(null);
  });
});

describe("objecten uit een array die nog groeit", () => {
  it("neemt alleen de objecten die AF zijn", () => {
    const dagen = afgewerkteObjecten(MENU_EEN_DAG, "dagen");
    expect(dagen).toHaveLength(1);
    expect(dagen[0].ontbijt).toBe("Havermout met banaan");
  });

  it("laat een accolade binnen een tekst met rust", () => {
    // Zonder de tekst-vlag telt deze `}` mee en valt het object een teken te vroeg af.
    const s = '{ "dagen": [ { "ontbijt": "Pap met noten {en zaden}", "lunch": "Soep" } ]';
    expect(afgewerkteObjecten(s, "dagen")[0].lunch).toBe("Soep");
  });

  it("stopt bij het einde van DEZE array en loopt niet door in de volgende", () => {
    const s = '{ "dagen": [ { "lunch": "Soep" } ], "andere": [ { "lunch": "Niet van mij" } ] }';
    expect(afgewerkteObjecten(s, "dagen")).toEqual([{ lunch: "Soep" }]);
  });

  it("geeft een lege lijst wanneer de array nog niet begonnen is", () => {
    expect(afgewerkteObjecten('{ "toelichting": "..."', "dagen")).toEqual([]);
  });
});

describe("wat het lid te zien krijgt terwijl zijn menu geschreven wordt", () => {
  it("koppelt de plaats in de lijst aan de dag — de dagen dragen zelf geen naam", () => {
    const r = uitMenu(MENU_EEN_DAG);
    expect(r.toelichting).toBe("Twee zinnen uitleg.");
    expect(r.dagen).toHaveLength(1);
    expect(r.dagen[0].dag).toBe("maandag");
    expect(r.dagen[0].avondeten).toBe("Zalm met rijst");
  });

  it("houdt het bij zeven dagen, ook als het model er meer geeft", () => {
    const dag = '{ "ontbijt": "x", "lunch": "y", "avondeten": "z", "tussendoor": "w" }';
    const s = `{ "dagen": [ ${Array(9).fill(dag).join(", ")} ] }`;
    expect(uitMenu(s).dagen).toHaveLength(7);
    expect(uitMenu(s).dagen[6].dag).toBe("zondag");
  });

  it("overleeft een lege invoer", () => {
    expect(uitMenu("")).toEqual({ toelichting: "", toelichtingAf: false, dagen: [] });
  });
});

describe("wat het lid te zien krijgt terwijl zijn plan geschreven wordt", () => {
  const PLAN = `{
    "samenvatting": "Je traint drie keer per week en wil sterker worden, dus we bouwen op rond drie grote bewegingen.",
    "weken": [ { "nr": 1, "focus": "wennen aan de basis" }, { "nr": 2, "focus": "iets zwaarder" } ],
    "week1": { "sessies": [
      { "naam": "Onderlichaam", "blokken": [ { "categorie": "benen" }, { "categorie": "core" } ] },
      { "naam": "Push`;

  it("haalt de samenvatting, de weken en de afgewerkte sessies eruit", () => {
    const r = uitPlan(PLAN);
    expect(r.samenvattingAf).toBe(true);
    expect(r.samenvatting).toMatch(/drie grote bewegingen/);
    expect(r.weken).toEqual([{ nr: 1, focus: "wennen aan de basis" }, { nr: 2, focus: "iets zwaarder" }]);
    // "Push" is nog niet af en hoort er dus niet bij te staan.
    expect(r.sessies).toEqual([{ naam: "Onderlichaam", blokken: 2 }]);
  });

  it("telt de blokken van een sessie, niet de blokken zelf als sessie", () => {
    // De blokken zitten ÍN de sessie. Een lezer die elk afgesloten object oppakt, zou ze als
    // losse sessies tonen — vandaar dat we op de sleutel `naam` filteren.
    expect(uitPlan(PLAN).sessies.every((s) => typeof s.naam === "string")).toBe(true);
  });

  it("overleeft een antwoord dat nog niets bruikbaars bevat", () => {
    expect(uitPlan("{")).toEqual({ samenvatting: "", samenvattingAf: false, weken: [], sessies: [] });
  });
});
