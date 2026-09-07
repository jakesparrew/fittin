import { describe, it, expect } from "vitest";
import { GESLACHTEN, leeftijdOp, keurGeboortedatum, keurGeslacht, persoonsregel } from "./aanmelding-velden.js";

// Een geboortedatum is bedrieglijk eenvoudig: de randen (verjaardag vandaag, schrikkeldag, een
// datum die niet bestaat) zijn precies waar het misgaat, en een fout valt pas op wanneer iemand
// een jaar te oud of te jong in de mail staat.
const NU = new Date("2026-09-08T10:00:00Z");

describe("leeftijd uit een geboortedatum", () => {
  it("telt de verjaardag pas mee als ze geweest is", () => {
    expect(leeftijdOp("1990-09-07", NU)).toBe(36); // gisteren jarig
    expect(leeftijdOp("1990-09-08", NU)).toBe(36); // vandaag jarig — telt mee
    expect(leeftijdOp("1990-09-09", NU)).toBe(35); // morgen jarig — nog niet
  });

  it("rekent over een maandgrens heen", () => {
    expect(leeftijdOp("1990-10-01", NU)).toBe(35);
    expect(leeftijdOp("1990-08-31", NU)).toBe(36);
  });

  it("gaat om met een schrikkeldag", () => {
    expect(leeftijdOp("2000-02-29", NU)).toBe(26);
  });

  it("geeft null bij onzin", () => {
    expect(leeftijdOp("", NU)).toBe(null);
    expect(leeftijdOp("08/09/1990", NU)).toBe(null);
    expect(leeftijdOp(null, NU)).toBe(null);
  });
});

describe("keuring van de geboortedatum", () => {
  it("laat leeg gewoon leeg — het veld mag niet blokkeren op een lege waarde", () => {
    expect(keurGeboortedatum("", NU)).toEqual({ leeg: true });
    expect(keurGeboortedatum(null, NU)).toEqual({ leeg: true });
  });

  it("aanvaardt een gewone datum en geeft de leeftijd terug", () => {
    expect(keurGeboortedatum("1990-05-12", NU)).toEqual({ datum: "1990-05-12", leeftijd: 36 });
  });

  it("weigert een datum die niet bestaat", () => {
    // 31 februari komt door de regex; Date zou er stilzwijgend 3 maart van maken.
    expect(keurGeboortedatum("1990-02-31", NU).error).toMatch(/bestaat niet/i);
    expect(keurGeboortedatum("2001-02-29", NU).error).toMatch(/bestaat niet/i); // geen schrikkeljaar
  });

  it("weigert de toekomst", () => {
    expect(keurGeboortedatum("2030-01-01", NU).error).toMatch(/toekomst/i);
  });

  it("weigert wat op een typfout lijkt", () => {
    expect(keurGeboortedatum("2020-01-01", NU).error).toMatch(/na/i);   // 6 jaar
    expect(keurGeboortedatum("1826-01-01", NU).error).toMatch(/na/i);   // 200 jaar
  });

  it("weigert een verkeerd formaat", () => {
    expect(keurGeboortedatum("12-05-1990", NU).error).toMatch(/jaar-maand-dag/i);
    expect(keurGeboortedatum("1990/05/12", NU).error).toMatch(/jaar-maand-dag/i);
  });
});

describe("keuring van het geslacht", () => {
  it("laat de drie keuzes door", () => {
    for (const g of GESLACHTEN) expect(keurGeslacht(g)).toBe(g);
  });

  it("leeg blijft leeg — dat IS 'zeg ik liever niet'", () => {
    expect(keurGeslacht("")).toBe("");
    expect(keurGeslacht(null)).toBe("");
  });

  it("negeert geknoei met het formulier zonder de bezoeker te blokkeren", () => {
    expect(keurGeslacht("<script>")).toBe("");
    expect(keurGeslacht("Attack helicopter")).toBe("");
  });
});

describe("de regel die in de aanmeldingsmail belandt", () => {
  it("zet beide velden op één regel", () => {
    const k = keurGeboortedatum("1990-05-12", NU);
    expect(persoonsregel("Vrouw", k)).toBe("Geslacht: Vrouw · Geboortedatum: 1990-05-12 (36 jaar)");
  });

  it("laat weg wat niet ingevuld is", () => {
    expect(persoonsregel("", keurGeboortedatum("1990-05-12", NU))).toBe("Geboortedatum: 1990-05-12 (36 jaar)");
    expect(persoonsregel("Man", { leeg: true })).toBe("Geslacht: Man");
    expect(persoonsregel("", { leeg: true })).toBe("");
  });
});
