import { describe, it, expect } from "vitest";
import { leesJson, schoonBlokken, zelfgeschrevenZin } from "./plan.js";

// De pure stukken van de orkestratie. Wat de databank raakt wordt hier niet getest — dat gebeurt
// end-to-end op een testaccount. Wat hier staat is precies wat er misgaat zonder test: een model
// dat JSON in een codeblok stopt, een model dat 400 sets voorstelt, en de zin die er moet staan
// wanneer het model helemaal niets zegt.

describe("JSON uit een modelantwoord halen", () => {
  it("leest gewone JSON", () => {
    expect(leesJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("leest JSON uit een codeblok — modellen doen dat ook als je erom vraagt het niet te doen", () => {
    expect(leesJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(leesJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("leest JSON met een zin ervoor", () => {
    expect(leesJson('Hier is je plan:\n{"a":1}')).toEqual({ a: 1 });
  });

  it("geeft null bij iets onbruikbaars in plaats van te gooien", () => {
    expect(leesJson("geen json hier")).toBe(null);
    expect(leesJson("")).toBe(null);
    expect(leesJson(null)).toBe(null);
    expect(leesJson("{kapot")).toBe(null);
  });
});

describe("blokken opschonen", () => {
  it("houdt alleen wat we kennen", () => {
    const uit = schoonBlokken([{ categorie: "Benen", mechanic: "compound", sectie: "Hoofdoefening", sets: 4, reps: 8, rust: 120 }]);
    expect(uit).toEqual([{ categorie: "benen", mechanic: "compound", sectie: "Hoofdoefening", sets: 4, reps: 8, rust: 120 }]);
  });

  it("trekt onmogelijke getallen recht in plaats van ze door te laten", () => {
    const [b] = schoonBlokken([{ categorie: "rug", sets: 400, reps: 9999, rust: 99999 }]);
    expect(b.sets).toBe(8);
    expect(b.reps).toBe(50);
    expect(b.rust).toBe(300);
  });

  it("vult ontbrekende waarden met iets redelijks", () => {
    const [b] = schoonBlokken([{ categorie: "core" }]);
    expect(b.sets).toBe(3);
    expect(b.reps).toBe(10);
    expect(b.rust).toBe(90);
    expect(b.sectie).toBe("Hoofdoefening");
  });

  it("gooit een blok zonder categorie weg — daar valt niets mee te kiezen", () => {
    expect(schoonBlokken([{ sets: 3 }])).toEqual([]);
  });

  it("weigert een verzonnen sectie", () => {
    expect(schoonBlokken([{ categorie: "borst", sectie: "Superset van de dood" }])[0].sectie).toBe("Hoofdoefening");
  });

  it("kapt een absurd lange lijst af", () => {
    const veel = Array.from({ length: 50 }, () => ({ categorie: "benen" }));
    expect(schoonBlokken(veel)).toHaveLength(8);
  });

  it("gaat om met onzin", () => {
    expect(schoonBlokken(null)).toEqual([]);
    expect(schoonBlokken("tekst")).toEqual([]);
  });
});

describe("de zin die er staat als het model niets zegt", () => {
  it("noemt de feiten bij een volledige week", () => {
    const z = zelfgeschrevenZin({ besluit: "door" }, 3, 3, false);
    expect(z).toMatch(/alle 3 sessies/);
    expect(z).toMatch(/verder/);
  });

  it("is niet verwijtend bij een halve week", () => {
    const z = zelfgeschrevenZin({ besluit: "inkorten" }, 2, 3, false);
    expect(z).toMatch(/2 van de 3/);
    expect(z).toMatch(/korter/);
    expect(z).not.toMatch(/helaas|jammer|niet gehaald/i);
  });

  it("stelt herhalen voor zonder er een straf van te maken", () => {
    expect(zelfgeschrevenZin({ besluit: "herhaal" }, 1, 3, false)).toMatch(/geen haast/);
  });

  it("legt een rustweek uit als bedoeld, niet als achterstand", () => {
    expect(zelfgeschrevenZin({ besluit: "door" }, 3, 3, true)).toMatch(/bewust een lichtere week/);
  });
});
