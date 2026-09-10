import { describe, it, expect } from "vitest";
import { score, kiesOefeningen, verdeelFocus, keurVoorschriften, zaadUit, CATEGORIEEN } from "./keuze.js";

// De bibliotheek zoals ze er in productie uitziet: 886 rijen, categorieën benen/armen/schouders/
// rug/core/borst, difficulty beginner/intermediate/gevorderd, en een flink deel zonder `mechanic`.
const BIB = [
  { id: "sq", name: "Squat", category: "benen", difficulty: "intermediate", mechanic: "compound", equipment: "Barbell", animation_url: "a.mp4", instructions: ["1"] },
  { id: "lp", name: "Legpress", category: "benen", difficulty: "beginner", mechanic: "compound", equipment: "Machine", image_url: "b.jpg" },
  { id: "le", name: "Leg extension", category: "benen", difficulty: "beginner", mechanic: "isolation", equipment: "Machine" },
  { id: "sn", name: "Snatch", category: "benen", difficulty: "gevorderd", mechanic: "compound", equipment: "Barbell", animation_url: "c.mp4" },
  { id: "bp", name: "Bankdrukken", category: "borst", difficulty: "intermediate", mechanic: "compound", equipment: "Barbell", animation_url: "d.mp4" },
  { id: "pu", name: "Push-up", category: "borst", difficulty: "beginner", mechanic: "compound", equipment: "Lichaamsgewicht", animation_url: "e.mp4" },
  { id: "cu", name: "Curl", category: "armen", difficulty: "beginner", mechanic: "isolation", equipment: "Dumbbell" },
  { id: "ge", name: "Geen categorie", category: null, difficulty: "beginner" },
];

describe("score", () => {
  it("weigert een andere categorie botweg", () => {
    expect(score(BIB[0], { categorie: "borst" })).toBe(-1);
    expect(score(BIB[0], { categorie: "benen" })).toBeGreaterThan(0);
  });

  it("weigert wat boven het niveau van het lid ligt", () => {
    // Een beginner krijgt geen snatch.
    expect(score(BIB[3], { categorie: "benen" }, { niveau: "nooit" })).toBe(-1);
    expect(score(BIB[3], { categorie: "benen" }, { niveau: "vaak" })).toBeGreaterThan(0);
  });

  it("weigert materiaal dat de zaal niet heeft", () => {
    expect(score(BIB[0], { categorie: "benen" }, { materiaal: ["Machine", "Dumbbell"] })).toBe(-1);
    expect(score(BIB[1], { categorie: "benen" }, { materiaal: ["Machine", "Dumbbell"] })).toBeGreaterThan(0);
  });

  it("laat alles toe als de materiaallijst leeg of onbekend is", () => {
    // Liever een oefening te veel dan een lege sessie.
    expect(score(BIB[0], { categorie: "benen" }, { materiaal: [] })).toBeGreaterThan(0);
    expect(score(BIB[0], { categorie: "benen" }, { materiaal: null })).toBeGreaterThan(0);
  });

  it("beloont een demo — het lid staat alleen in de zaal", () => {
    const metVideo = score(BIB[1], { categorie: "benen" });   // image_url
    const zonder = score(BIB[2], { categorie: "benen" });     // niets
    expect(metVideo).toBeGreaterThan(zonder);
  });

  it("laat een oefening zonder mechanic niet wegvallen", () => {
    // 109 van de 886 rijen hebben geen mechanic; die mogen niet allemaal onbruikbaar worden.
    const zonderMechanic = { id: "x", category: "benen", difficulty: "beginner" };
    expect(score(zonderMechanic, { categorie: "benen", mechanic: "compound" })).toBeGreaterThanOrEqual(0);
  });
});

describe("kiezen", () => {
  const blokken = [
    { categorie: "benen", mechanic: "compound", sets: 3, reps: 8 },
    { categorie: "benen", mechanic: "isolation", sets: 3, reps: 12 },
    { categorie: "borst", mechanic: "compound", sets: 3, reps: 10 },
  ];

  it("kiest voor elk blok een bestaande oefening", () => {
    const { gekozen, tekort } = kiesOefeningen(blokken, BIB, { niveau: "soms", zaad: "p1w1" });
    expect(tekort).toEqual([]);
    expect(gekozen).toHaveLength(3);
    for (const g of gekozen) expect(BIB.some((b) => b.id === g.exercise_id)).toBe(true);
  });

  it("herhaalt zich niet binnen dezelfde week zolang er keuze is", () => {
    const { gekozen } = kiesOefeningen(blokken, BIB, { zaad: "p1w1" });
    const ids = gekozen.map((g) => g.exercise_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("geeft twee keer hetzelfde bij hetzelfde zaad — een week opnieuw opbouwen mag niet verrassen", () => {
    const a = kiesOefeningen(blokken, BIB, { zaad: "plan-42|week-3" }).gekozen.map((g) => g.exercise_id);
    const b = kiesOefeningen(blokken, BIB, { zaad: "plan-42|week-3" }).gekozen.map((g) => g.exercise_id);
    expect(a).toEqual(b);
  });

  it("respecteert wat al gebruikt is, maar valt er in nood op terug", () => {
    // Eén blok, één mogelijke borstoefening voor een beginner zonder materiaal-Barbell.
    const { gekozen } = kiesOefeningen(
      [{ categorie: "borst", sets: 3, reps: 10 }],
      BIB,
      { niveau: "nooit", vermijd: ["pu"], zaad: "z" }
    );
    // Liever herhalen dan niets: het blok wordt ingevuld, ook al stond die oefening op vermijd.
    expect(gekozen).toHaveLength(1);
    expect(gekozen[0].exercise_id).toBe("pu");
  });

  it("meldt een tekort in plaats van iets te verzinnen", () => {
    const { gekozen, tekort } = kiesOefeningen(
      [{ categorie: "schouders", sets: 3, reps: 10 }],
      BIB,
      { zaad: "z" }
    );
    expect(gekozen).toEqual([]);
    expect(tekort).toHaveLength(1);
  });

  it("kan nooit een oefening buiten de bibliotheek opleveren", () => {
    // De kern van het ontwerp: hallucinatie is structureel onmogelijk.
    const ids = new Set(BIB.map((b) => b.id));
    const alle = CATEGORIEEN.map((c) => ({ categorie: c, sets: 3, reps: 10 }));
    const { gekozen } = kiesOefeningen(alle, BIB, { niveau: "vaak", zaad: "z" });
    for (const g of gekozen) expect(ids.has(g.exercise_id)).toBe(true);
  });
});

describe("focusverdeling", () => {
  it("zet niet drie keer dezelfde spiergroep in één week", () => {
    const w = verdeelFocus(3);
    expect(w).toHaveLength(3);
    expect(new Set(w.flat()).size).toBeGreaterThan(3);
  });
  it("vangt onmogelijke aantallen op", () => {
    expect(verdeelFocus(0)).toHaveLength(1);
    expect(verdeelFocus(99)).toHaveLength(5);
  });
});

describe("de laatste poort vóór het lid iets ziet", () => {
  const geldig = new Set(["sq", "bp"]);

  it("laat correcte voorschriften door", () => {
    expect(keurVoorschriften([{ exercise_id: "sq", sets: 3 }], geldig).ok).toBe(true);
  });

  it("betrapt een oefening die niet bestaat", () => {
    const uit = keurVoorschriften([{ exercise_id: "verzonnen", sets: 3 }], geldig);
    expect(uit.ok).toBe(false);
    expect(uit.fout[0].reden).toMatch(/bestaat niet/);
  });

  it("betrapt een blok zonder oefening", () => {
    expect(keurVoorschriften([{ sets: 3 }], geldig).ok).toBe(false);
  });

  it("betrapt een onmogelijk aantal sets", () => {
    expect(keurVoorschriften([{ exercise_id: "sq", sets: 40 }], geldig).ok).toBe(false);
    expect(keurVoorschriften([{ exercise_id: "sq", sets: 0 }], geldig).ok).toBe(false);
  });
});

describe("zaad", () => {
  it("is stabiel en niet negatief", () => {
    expect(zaadUit("abc")).toBe(zaadUit("abc"));
    expect(zaadUit("abc")).toBeGreaterThanOrEqual(0);
    expect(zaadUit("abc")).not.toBe(zaadUit("abd"));
  });
});
