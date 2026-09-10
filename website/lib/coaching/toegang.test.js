import { describe, it, expect, afterEach } from "vitest";
import { magCoaching, toegelatenAdressen, coachingOpenVoorIedereen, PROEFGROEP } from "./toegang.js";

const oud = process.env.COACH_AI_TOEGANG;
afterEach(() => {
  if (oud === undefined) delete process.env.COACH_AI_TOEGANG;
  else process.env.COACH_AI_TOEGANG = oud;
});

const lid = (email) => ({ role: "lid", email });

describe("de poort staat standaard dicht", () => {
  it("laat alleen de proefgroep door als er niets ingesteld is", () => {
    delete process.env.COACH_AI_TOEGANG;
    expect(magCoaching(lid("ran.knockaert@gmail.com"))).toBe(true);
    expect(magCoaching(lid("gaetanjansseune@gmail.com"))).toBe(true);
    expect(magCoaching(lid("iemand.anders@gmail.com"))).toBe(false);
  });

  it("laat een lege of witruimte-instelling niet als 'iedereen' gelden", () => {
    // Dit is de gevaarlijke stand: een variabele die per ongeluk leeg staat mag de coach nooit
    // voor alle leden openzetten.
    for (const waarde of ["", "   "]) {
      process.env.COACH_AI_TOEGANG = waarde;
      expect(magCoaching(lid("iemand.anders@gmail.com")), `bij ${JSON.stringify(waarde)}`).toBe(false);
      expect(toegelatenAdressen()).toEqual(PROEFGROEP);
    }
  });

  it("weigert een profiel zonder e-mailadres", () => {
    delete process.env.COACH_AI_TOEGANG;
    expect(magCoaching(lid(null))).toBe(false);
    expect(magCoaching(lid(""))).toBe(false);
    expect(magCoaching({ role: "lid" })).toBe(false);
    expect(magCoaching(null)).toBe(false);
  });
});

describe("de beheerder", () => {
  it("mag altijd, ook als hij niet in de lijst staat", () => {
    process.env.COACH_AI_TOEGANG = "iemand@example.com";
    expect(magCoaching({ role: "beheerder", email: "admin@fittin.be" })).toBe(true);
  });

  it("maar een coach niet", () => {
    process.env.COACH_AI_TOEGANG = "iemand@example.com";
    expect(magCoaching({ role: "coach", email: "coach@fittin.be" })).toBe(false);
  });
});

describe("de lijst instellen", () => {
  it("neemt komma-gescheiden adressen over en negeert hoofdletters en spaties", () => {
    process.env.COACH_AI_TOEGANG = " Een@Voorbeeld.be , twee@voorbeeld.be ";
    expect(toegelatenAdressen()).toEqual(["een@voorbeeld.be", "twee@voorbeeld.be"]);
    expect(magCoaching(lid("EEN@voorbeeld.BE"))).toBe(true);
    expect(magCoaching(lid("drie@voorbeeld.be"))).toBe(false);
  });

  it("vervangt de proefgroep in plaats van eraan toe te voegen", () => {
    // Anders kan je nooit iemand uit de lijst halen zonder de code aan te passen.
    process.env.COACH_AI_TOEGANG = "iemand@example.com";
    expect(magCoaching(lid("ran.knockaert@gmail.com"))).toBe(false);
  });

  it("zet hem open voor iedereen met het woord 'iedereen'", () => {
    process.env.COACH_AI_TOEGANG = "iedereen";
    expect(coachingOpenVoorIedereen()).toBe(true);
    expect(magCoaching(lid("wie.dan.ook@gmail.com"))).toBe(true);
    process.env.COACH_AI_TOEGANG = "IEDEREEN";
    expect(magCoaching(lid("wie.dan.ook@gmail.com"))).toBe(true);
  });
});
