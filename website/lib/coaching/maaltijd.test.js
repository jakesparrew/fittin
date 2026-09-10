import { describe, it, expect } from "vitest";
import { kcalOndergrens, dagbehoefte, vraagtOmEenDietist, schoonMenu, schoonBoodschappen, VOEDINGSVOORKEUREN, richtlijnVoor, moetVernieuwen, maaltijdenAan } from "./maaltijd.js";

// De grenzen rond voeding staan in code en niet in een prompt. Een grens die je aan een taalmodel
// vraagt is een verzoek; een grens in code is een grens. Deze tests zijn die grens.

describe("de harde ondergrens", () => {
  it("ligt op 1.500 voor een vrouw en 1.800 voor een man", () => {
    expect(kcalOndergrens("Vrouw")).toBe(1500);
    expect(kcalOndergrens("Man")).toBe(1800);
  });

  it("valt bij een onbekend of niet opgegeven geslacht terug op de laagste grens", () => {
    // Wie het niet zegt, krijgt de voorzichtigste norm — nooit de ruimste.
    expect(kcalOndergrens(null)).toBe(1500);
    expect(kcalOndergrens("X")).toBe(1500);
  });
});

describe("dagbehoefte", () => {
  const basis = { gewichtKg: 80, lengteCm: 180, leeftijd: 35, geslacht: "Man", sessiesPerWeek: 3 };

  it("rekent een plausibele onderhoudsbehoefte", () => {
    const kcal = dagbehoefte({ ...basis, doel: "bewegen" });
    // Een man van 80 kg, 1m80, 35 jaar die drie keer per week traint zit rond 2.500.
    expect(kcal).toBeGreaterThan(2100);
    expect(kcal).toBeLessThan(3000);
  });

  it("trekt af bij afvallen, maar nooit meer dan een zesde", () => {
    const onderhoud = dagbehoefte({ ...basis, doel: "bewegen" });
    const afvallen = dagbehoefte({ ...basis, doel: "afvallen" });
    expect(afvallen).toBeLessThan(onderhoud);
    expect(afvallen / onderhoud).toBeGreaterThan(0.8);
  });

  it("telt op bij spiermassa, maar bescheiden", () => {
    const onderhoud = dagbehoefte({ ...basis, doel: "bewegen" });
    const bulk = dagbehoefte({ ...basis, doel: "spiermassa" });
    expect(bulk).toBeGreaterThan(onderhoud);
    expect(bulk / onderhoud).toBeLessThan(1.2);
  });

  it("schaalt mee met het aantal sessies", () => {
    const weinig = dagbehoefte({ ...basis, sessiesPerWeek: 1, doel: "bewegen" });
    const veel = dagbehoefte({ ...basis, sessiesPerWeek: 6, doel: "bewegen" });
    expect(veel).toBeGreaterThan(weinig);
  });

  it("geeft null zodra er een gegeven ontbreekt in plaats van te gokken", () => {
    expect(dagbehoefte({ ...basis, gewichtKg: null })).toBe(null);
    expect(dagbehoefte({ ...basis, lengteCm: null })).toBe(null);
    expect(dagbehoefte({ ...basis, leeftijd: null })).toBe(null);
  });
});

describe("wanneer de coach zwijgt en doorverwijst", () => {
  it("herkent wat bij een diëtist of arts hoort", () => {
    for (const t of [
      "Ik ben zwanger",
      "diabetes type 2",
      "ik neem medicatie voor mijn schildklier",
      "coeliakie",
      "ik heb een eetstoornis gehad",
      "net een operatie ondergaan",
    ]) {
      expect(vraagtOmEenDietist(t), `"${t}" hoort een stopwoord te zijn`).toBe(true);
    }
  });

  it("laat gewone voorkeuren gewoon door", () => {
    for (const t of ["geen paprika", "vegetarisch", "ik hou niet van vis", "lage rug", ""]) {
      expect(vraagtOmEenDietist(t), `"${t}" is geen stopwoord`).toBe(false);
    }
  });

  it("kijkt niet naar hoofdletters", () => {
    expect(vraagtOmEenDietist("ZWANGER")).toBe(true);
  });
});

describe("het menu opschonen", () => {
  const volledig = { dagen: Array.from({ length: 7 }, (_, i) => ({ ontbijt: `o${i}`, lunch: `l${i}`, avondeten: `a${i}`, tussendoor: `t${i}` })) };

  it("levert zeven benoemde dagen", () => {
    const m = schoonMenu(volledig);
    expect(m).toHaveLength(7);
    expect(m[0].dag).toBe("maandag");
    expect(m[6].dag).toBe("zondag");
  });

  it("weigert een menu met te veel gaten — half geleverd is niet geleverd", () => {
    const half = { dagen: [{ ontbijt: "x" }, {}, {}, {}, {}, {}, {}] };
    expect(schoonMenu(half)).toBe(null);
  });

  it("aanvaardt een menu waar één dag ontbreekt", () => {
    const bijna = { dagen: [...volledig.dagen.slice(0, 6), {}] };
    expect(schoonMenu(bijna)).toHaveLength(7);
  });

  it("kapt te lange maaltijdbeschrijvingen af", () => {
    const lang = { dagen: volledig.dagen.map((d) => ({ ...d, ontbijt: "x".repeat(900) })) };
    expect(schoonMenu(lang)[0].ontbijt.length).toBe(200);
  });

  it("gaat om met onzin", () => {
    expect(schoonMenu(null)).toBe(null);
    expect(schoonMenu({ dagen: "tekst" })).toBe(null);
  });
});

describe("de boodschappenlijst", () => {
  it("kapt af en gooit lege regels weg", () => {
    expect(schoonBoodschappen(["500 g havermout", "", "  ", "1 kg kip"])).toEqual(["500 g havermout", "1 kg kip"]);
    expect(schoonBoodschappen(Array.from({ length: 200 }, () => "x"))).toHaveLength(60);
  });
  it("gaat om met onzin", () => {
    expect(schoonBoodschappen(null)).toEqual([]);
    expect(schoonBoodschappen("tekst")).toEqual([]);
  });
});

describe("voorkeuren", () => {
  it("heeft een lijst met bruikbare keuzes", () => {
    expect(VOEDINGSVOORKEUREN.length).toBeGreaterThan(4);
    for (const v of VOEDINGSVOORKEUREN) {
      expect(v.v).toMatch(/^[a-z-]+$/);
      expect(v.l.length).toBeGreaterThan(2);
    }
  });
});

describe("de richtlijn", () => {
  const profiel = {
    coaching_toestemming_at: "2026-09-01T00:00:00Z",
    gewicht_kg: 80, height_cm: 180, geboortedatum: "1990-05-01",
    geslacht: "Man", coaching_dagen: 3, coaching_doel: "afvallen",
  };

  it("weigert zonder toestemming — niet een algemener menu, maar géén", () => {
    const r = richtlijnVoor({ ...profiel, coaching_toestemming_at: null });
    expect(r.error).toBeTruthy();
    expect(r.richtlijn).toBeUndefined();
  });

  it("weigert zolang gewicht, lengte of geboortedatum ontbreken", () => {
    expect(richtlijnVoor({ ...profiel, gewicht_kg: null }).error).toBeTruthy();
    expect(richtlijnVoor({ ...profiel, height_cm: null }).error).toBeTruthy();
    expect(richtlijnVoor({ ...profiel, geboortedatum: null }).error).toBeTruthy();
  });

  it("verwijst door zodra er een stopwoord in de vrije tekst staat", () => {
    const r = richtlijnVoor({ ...profiel, coaching_voeding_vrij: "ik ben zwanger" });
    expect(r.dietist).toBe(true);
    expect(r.richtlijn).toBeUndefined();
  });

  it("kijkt ook naar het beperkingenveld van de training", () => {
    expect(richtlijnVoor({ ...profiel, coaching_beperkingen: "neem medicatie" }).dietist).toBe(true);
  });

  it("komt bij een afvaldoel nooit onder de ondergrens uit", () => {
    // Klein en licht, doel afvallen: de formule duikt onder 1.500, de grens houdt tegen.
    const klein = { ...profiel, geslacht: "Vrouw", gewicht_kg: 48, height_cm: 155, coaching_dagen: 1 };
    expect(richtlijnVoor(klein).richtlijn).toBe(1500);
  });

  it("geeft anders gewoon de berekende behoefte", () => {
    expect(richtlijnVoor(profiel).richtlijn).toBeGreaterThan(1800);
  });
});

describe("wanneer er een nieuw menu moet komen", () => {
  const vorige = { weeknummer: 2, kcal_richtlijn: 2400 };

  it("de eerste keer altijd", () => {
    expect(moetVernieuwen({ vorige: null, weeknummer: 1, richtlijn: 2400 }).ja).toBe(true);
  });

  it("niet wanneer er niets veranderde — hetzelfde menu mag mee", () => {
    const r = moetVernieuwen({ vorige, weeknummer: 3, richtlijn: 2400, checkin: { menu_gevolgd: "vlot", honger: "nee" } });
    expect(r.ja).toBe(false);
  });

  it("wel wanneer het niet lukte of er honger was", () => {
    expect(moetVernieuwen({ vorige, weeknummer: 3, richtlijn: 2400, checkin: { menu_gevolgd: "niet" } }).ja).toBe(true);
    expect(moetVernieuwen({ vorige, weeknummer: 3, richtlijn: 2400, checkin: { honger: "vaak" } }).ja).toBe(true);
  });

  it("wel wanneer de richtlijn merkbaar verschoof", () => {
    expect(moetVernieuwen({ vorige, weeknummer: 3, richtlijn: 2500 }).ja).toBe(true);
    expect(moetVernieuwen({ vorige, weeknummer: 3, richtlijn: 2450 }).ja).toBe(false);
  });

  it("wel na vier weken hetzelfde, voor de afwisseling", () => {
    expect(moetVernieuwen({ vorige, weeknummer: 6, richtlijn: 2400 }).ja).toBe(true);
    expect(moetVernieuwen({ vorige, weeknummer: 5, richtlijn: 2400 }).ja).toBe(false);
  });
});

describe("de module", () => {
  it("staat alleen aan wanneer het lid ze aanzette", () => {
    expect(maaltijdenAan({ coaching_modules: ["workouts", "mealplan"] })).toBe(true);
    expect(maaltijdenAan({ coaching_modules: ["workouts"] })).toBe(false);
    expect(maaltijdenAan({})).toBe(false);
    expect(maaltijdenAan(null)).toBe(false);
  });
});
