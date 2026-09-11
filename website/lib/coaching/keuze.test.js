import { describe, it, expect } from "vitest";
import { score, kiesOefeningen, verdeelFocus, keurVoorschriften, zaadUit, CATEGORIEEN, KERNOEFENINGEN, patroonVan, HOOFDPATROON } from "./keuze.js";

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
    // Twee oefeningen die in alles gelijk zijn behalve de demo. Vergelijk je twee verschillende
    // oefeningen, dan meet je de herkenbaarheidsbonus mee en zegt de uitkomst niets over media.
    const zelfde = { category: "benen", difficulty: "beginner", mechanic: "compound", equipment: "Machine" };
    const metVideo = score({ ...zelfde, id: "a", name: "Leg Press", animation_url: "x.mp4" }, { categorie: "benen" });
    const metFoto = score({ ...zelfde, id: "b", name: "Leg Press", image_url: "x.jpg" }, { categorie: "benen" });
    const zonder = score({ ...zelfde, id: "c", name: "Leg Press" }, { categorie: "benen" });
    expect(metVideo).toBeGreaterThan(metFoto);
    expect(metFoto).toBeGreaterThan(zonder);
  });

  it("herkent een basisoefening ongeacht spatie of streepje", () => {
    // De bibliotheek is deels met de hand gevuld en deels geïmporteerd; beide schrijfwijzen staan
    // erin. "Legpress" hoort even herkenbaar te zijn als "Leg Press".
    const basis = { category: "benen", difficulty: "beginner", mechanic: "compound", equipment: "Machine" };
    const a = score({ ...basis, id: "a", name: "Leg Press" }, { categorie: "benen" });
    const b = score({ ...basis, id: "b", name: "Legpress" }, { categorie: "benen" });
    const c = score({ ...basis, id: "c", name: "Leg-Press" }, { categorie: "benen" });
    expect(a).toBe(b);
    expect(a).toBe(c);
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

// Toegevoegd na de EERSTE echte generatie (10-09-2026). Die leverde "Double Leg Butt Kick" als
// hoofdoefening benen op 4×6 met 120s rust, "Clean and Press" als opwarming en "Elbows Back" —
// een rekoefening — als borstaccessoire. De machinerie klopte; de scoring was te grof. Deze tests
// leggen vast wat er sindsdien zwaarder weegt.
describe("herkenbaarheid en plaats in de sessie", () => {
  const basis = { id: "sq", name: "Barbell Squat", category: "benen", difficulty: "intermediate", mechanic: "compound", equipment: "Barbell" };
  const obscuur = { id: "ob", name: "Seated One-Arm Dumbbell Palms-Up Wrist Curl", category: "benen", difficulty: "beginner", mechanic: "compound", equipment: "Dumbbell" };
  const explosief = { id: "ck", name: "Double Leg Butt Kick", category: "benen", difficulty: "beginner", mechanic: "compound", equipment: "Lichaamsgewicht" };

  it("een basisoefening wint van een obscure variant", () => {
    const blok = { categorie: "benen", mechanic: "compound", sectie: "Hoofdoefening" };
    expect(score(basis, blok, { niveau: "soms" })).toBeGreaterThan(score(obscuur, blok, { niveau: "soms" }));
  });

  it("explosief werk kan nooit een opwarming zijn", () => {
    expect(score(explosief, { categorie: "benen", sectie: "Warming-up" }, { niveau: "vaak" })).toBe(-1);
    const clean = { id: "cp", name: "Clean and Press", category: "schouders", difficulty: "gevorderd", mechanic: "compound", equipment: "Barbell" };
    expect(score(clean, { categorie: "schouders", sectie: "Warming-up" }, { niveau: "vaak" })).toBe(-1);
  });

  it("explosief werk krijgt een beginner nooit", () => {
    expect(score(explosief, { categorie: "benen", sectie: "Hoofdoefening" }, { niveau: "nooit" })).toBe(-1);
  });

  it("een opwarming is licht en zonder stang", () => {
    const blok = { categorie: "benen", sectie: "Warming-up" };
    const licht = { id: "a", name: "Bodyweight Squat", category: "benen", difficulty: "beginner", equipment: "Lichaamsgewicht" };
    const zwaar = { id: "b", name: "Barbell Squat", category: "benen", difficulty: "intermediate", equipment: "Barbell" };
    expect(score(licht, blok)).toBeGreaterThan(score(zwaar, blok));
  });

  it("een hoofdoefening is samengesteld, geen isolatie", () => {
    const blok = { categorie: "benen", sectie: "Hoofdoefening" };
    const samengesteld = { id: "a", name: "Leg Press", category: "benen", difficulty: "beginner", mechanic: "compound", equipment: "Machine" };
    const isolatie = { id: "b", name: "Leg Extension", category: "benen", difficulty: "beginner", mechanic: "isolation", equipment: "Machine" };
    expect(score(samengesteld, blok)).toBeGreaterThan(score(isolatie, blok));
  });

  it("randmateriaal zakt naar achteren", () => {
    const blok = { categorie: "core", sectie: "Accessoire" };
    const gewoon = { id: "a", name: "Cable Crunch", category: "core", difficulty: "beginner", equipment: "Cable" };
    const rand = { id: "b", name: "Foam Roller Crunch", category: "core", difficulty: "beginner", equipment: "Foam roller" };
    expect(score(gewoon, blok)).toBeGreaterThan(score(rand, blok));
  });
});

describe("een opwarming is nooit een hoofdbeweging", () => {
  it("pull-ups komen niet als opwarming, ook al staan ze als beginner in de bibliotheek", () => {
    // Echt geval uit de eerste generatie: "Pullups" staat in de bibliotheek op difficulty
    // 'beginner', dus alle lichte-oefening-bonussen pakten hem op. Een opwarming van twaalf
    // pull-ups is geen opwarming.
    const blok = { categorie: "rug", sectie: "Warming-up" };
    const pullup = { id: "a", name: "Pullups", category: "rug", difficulty: "beginner", equipment: "Lichaamsgewicht" };
    const licht = { id: "b", name: "Arm Circles", category: "rug", difficulty: "beginner", equipment: "Lichaamsgewicht" };
    expect(score(licht, blok)).toBeGreaterThan(score(pullup, blok));
  });

  it("diezelfde pull-up is wél een goede hoofdoefening", () => {
    const blok = { categorie: "rug", sectie: "Hoofdoefening" };
    const pullup = { id: "a", name: "Pullups", category: "rug", difficulty: "beginner", equipment: "Lichaamsgewicht" };
    const licht = { id: "b", name: "Arm Circles", category: "rug", difficulty: "beginner", equipment: "Lichaamsgewicht" };
    expect(score(pullup, blok)).toBeGreaterThan(score(licht, blok));
  });
});

describe("de kernoefeningen", () => {
  it("de lijst loopt niet leeg", () => {
    // Verdwijnt deze lijst, dan kiest de coach weer niche varianten en merkt niemand het —
    // behalve het lid dat "Jefferson Squats" in zijn week ziet staan.
    // De lijst is sinds 11-09 per CATEGORIE, zodat "upright row" (schouders) geen kernbonus meer
    // opvangt op een rij die als `rug` getagd staat.
    const alle = Object.values(KERNOEFENINGEN).flat();
    expect(alle.length).toBeGreaterThan(35);
    expect(Object.keys(KERNOEFENINGEN).sort()).toEqual([...CATEGORIEEN].sort());
  });

  it("een kernoefening wint van een variant met dezelfde trefwoorden", () => {
    const zelfde = { category: "benen", difficulty: "intermediate", mechanic: "compound", equipment: "Barbell" };
    const kern = score({ ...zelfde, id: "a", name: "Barbell Squat" }, { categorie: "benen", sectie: "Hoofdoefening" });
    const variant = score({ ...zelfde, id: "b", name: "Jefferson Squats" }, { categorie: "benen", sectie: "Hoofdoefening" });
    expect(kern).toBeGreaterThan(variant);
  });

  it("werkt ook als de bibliotheek er iets achter plakt", () => {
    // "Barbell Bench Press - Medium Grip" is hoe het er echt in staat.
    const zelfde = { category: "borst", difficulty: "intermediate", mechanic: "compound", equipment: "Barbell" };
    const echt = score({ ...zelfde, id: "a", name: "Barbell Bench Press - Medium Grip" }, { categorie: "borst", sectie: "Hoofdoefening" });
    const variant = score({ ...zelfde, id: "b", name: "Floor Press with Chains" }, { categorie: "borst", sectie: "Hoofdoefening" });
    expect(echt).toBeGreaterThan(variant);
  });
});

// ---------------------------------------------------------------------------
// Bewegingspatronen
// ---------------------------------------------------------------------------
//
// Aanleiding: het eerste échte plan (11-09-2026, doel "sterker", 4 dagen). De dag heette "Pull" en
// bevatte geen enkele trekbeweging — hoofdoefening "Smith Machine Upright Row", opwarming een
// shrug. Geen modelfout: de code koos hem, omdat de score alleen SPIERGROEP en `mechanic` kende.
// "Rug" is geen beweging.

const rij = (naam, extra = {}) => ({
  id: naam, name: naam, category: "rug", difficulty: "beginner", mechanic: "compound",
  equipment: "Barbell", animation_url: "a.mp4", ...extra,
});

describe("bewegingspatronen", () => {
  it("herkent de zes patronen op naam", () => {
    expect(patroonVan({ name: "Barbell Squat" })).toBe("hurk");
    expect(patroonVan({ name: "Romanian Deadlift" })).toBe("scharnier");
    expect(patroonVan({ name: "Barbell Bench Press" })).toBe("duw_horizontaal");
    expect(patroonVan({ name: "Dumbbell shoulder press" })).toBe("duw_verticaal");
    expect(patroonVan({ name: "Bent Over Barbell Row" })).toBe("trek_horizontaal");
    expect(patroonVan({ name: "Wide-Grip Lat Pulldown" })).toBe("trek_verticaal");
  });

  it("een romanian deadlift is een scharnier, geen hurk", () => {
    // "deadlift" moet vóór "squat" gecontroleerd worden; anders wint het verkeerde patroon.
    expect(patroonVan({ name: "Romanian Deadlift" })).toBe("scharnier");
  });

  it("een leg curl is GEEN scharnier — dat is kniebuiging, geen heupscharnier", () => {
    // Stond hij er wel in, dan strafte een dag met een leg curl daarna een deadlift weg.
    expect(patroonVan({ name: "Seated Leg Curl" })).toBeNull();
  });

  it("upright row en shrug zijn geen trekpatroon, ook al staat er 'row' in", () => {
    // Dit is de exacte verwarring die de Pull-dag sloopte.
    expect(patroonVan({ name: "Smith Machine Upright Row" })).toBeNull();
    expect(patroonVan({ name: "Dumbbell Shrug" })).toBeNull();
  });

  it("een oefening zonder herkenbaar patroon geeft null, en dat is normaal", () => {
    expect(patroonVan({ name: "Cable Crunch" })).toBeNull();
    expect(patroonVan({ name: "" })).toBeNull();
    expect(patroonVan(null)).toBeNull();
  });
});

describe("de hoofdoefening moet de juiste BEWEGING zijn", () => {
  it("een echte roeibeweging verslaat de upright row op de Pull-dag", () => {
    // Het geval uit het echte plan: die twee stonden op 57 punten GELIJK en het zaad besliste.
    const blok = { categorie: "rug", mechanic: "compound", sectie: "Hoofdoefening" };
    const row = score(rij("Bent Over Barbell Row"), blok, { niveau: "nooit" });
    const upright = score(rij("Smith Machine Upright Row"), blok, { niveau: "nooit" });
    expect(row).toBeGreaterThan(upright);
    // En niet met één puntje: gelijkspel is hier precies het probleem.
    expect(row - upright).toBeGreaterThan(15);
  });

  it("een shrug is geen hoofdoefening voor de rug", () => {
    const blok = { categorie: "rug", mechanic: "compound", sectie: "Hoofdoefening" };
    expect(score(rij("Bent Over Barbell Row"), blok)).toBeGreaterThan(score(rij("Dumbbell Shrug"), blok));
  });

  it("elke categorie met een natuurlijk zwaar patroon heeft er een", () => {
    expect(Object.keys(HOOFDPATROON).sort()).toEqual(["benen", "borst", "rug", "schouders"]);
    // armen en core krijgen bewust geen eis: daar is de hoofdoefening per definitie bijwerk.
    expect(HOOFDPATROON.armen).toBeUndefined();
    expect(HOOFDPATROON.core).toBeUndefined();
  });

  it("een hoofdoefening op eigen lichaamsgewicht verliest van een verzwaarbare", () => {
    // Het echte plan gaf "Bodyweight Squat" als hoofdoefening aan iemand die STERKER wil worden —
    // dat is meteen aan zijn plafond.
    const blok = { categorie: "benen", mechanic: "compound", sectie: "Hoofdoefening" };
    const basis = { category: "benen", difficulty: "beginner", mechanic: "compound", animation_url: "a.mp4" };
    const zwaar = score({ ...basis, id: "a", name: "Leg Press", equipment: "Machine" }, blok, { niveau: "nooit" });
    const eigen = score({ ...basis, id: "b", name: "Bodyweight Squat", equipment: "Lichaamsgewicht" }, blok, { niveau: "nooit" });
    expect(zwaar).toBeGreaterThan(eigen);
  });

  it("maar de opwarming blijft licht — geen pull-ups vooraan", () => {
    // De rug-trekbonus mag NIET in de opwarming gelden; anders keert de oude fout terug.
    const blok = { categorie: "rug", sectie: "Warming-up" };
    const pullup = { id: "a", name: "Pullups", category: "rug", difficulty: "beginner", equipment: "Lichaamsgewicht" };
    const licht = { id: "b", name: "Arm Circles", category: "rug", difficulty: "beginner", equipment: "Lichaamsgewicht" };
    expect(score(licht, blok)).toBeGreaterThan(score(pullup, blok));
  });
});

describe("de kernbonus blijft binnen zijn eigen categorie", () => {
  it("'upright row' staat onder schouders en telt niet mee voor rug", () => {
    // Dit was het lek: `bevat()` keek alleen naar de naam, dus ving een rij die als `rug` getagd
    // staat 25 punten die voor een schouderblok bedoeld waren.
    expect(KERNOEFENINGEN.schouders).toContain("upright row");
    expect(KERNOEFENINGEN.rug).not.toContain("upright row");
    const alsRug = score(rij("Upright Row"), { categorie: "rug", sectie: "Accessoire" });
    const alsSchouder = score(rij("Upright Row", { category: "schouders" }), { categorie: "schouders", sectie: "Accessoire" });
    expect(alsSchouder).toBeGreaterThan(alsRug);
  });
});

describe("een week dekt duwen, trekken en benen", () => {
  // De echte vraag achter alle regels hierboven. Het vangnet van verdeelFocus wordt gebruikt zodra
  // het model voor een sessie niets bruikbaars teruggeeft, dus dit pad moet op zichzelf kloppen.
  const BREED = [
    ...["Barbell Squat|benen|compound|Barbell", "Leg Press|benen|compound|Machine", "Leg extension|benen|isolation|Machine",
        "Romanian Deadlift|benen|compound|Barbell", "Barbell Bench Press|borst|compound|Barbell",
        "Pushups|borst|compound|Lichaamsgewicht", "Bent Over Barbell Row|rug|compound|Barbell",
        "Wide-Grip Lat Pulldown|rug|compound|Cable", "Dumbbell Shrug|rug|isolation|Dumbbell",
        "Hyperextensions|rug|isolation|Lichaamsgewicht", "Barbell Shoulder Press|schouders|compound|Barbell",
        "Side Lateral Raise|schouders|isolation|Dumbbell", "Upright Row|schouders|compound|Barbell",
        "Barbell Curl|armen|isolation|Barbell", "Triceps Pushdown|armen|isolation|Cable",
        "Crunches|core|isolation|Lichaamsgewicht", "Plank|core|isolation|Lichaamsgewicht"]
      .map((r) => {
        const [name, category, mechanic, equipment] = r.split("|");
        return { id: name, name, category, mechanic, equipment, difficulty: "beginner", animation_url: "a.mp4" };
      }),
  ];

  for (const dagen of [2, 3, 4, 5]) {
    it(`een plan van ${dagen} dagen bevat duwen, trekken en benen`, () => {
      const gebruikt = [];
      const patronen = new Set();
      verdeelFocus(dagen).forEach((cats, d) => {
        // Zoals plan.js het vangnet opbouwt: het eerste blok is de hoofdoefening.
        const blokken = cats.map((c, j) => ({
          categorie: c, mechanic: j === 0 ? "compound" : null,
          sectie: j === 0 ? "Hoofdoefening" : "Accessoire", sets: 3, reps: 10, rust: 90,
        }));
        const { gekozen } = kiesOefeningen(blokken, BREED, { niveau: "soms", vermijd: gebruikt, zaad: `t${dagen}|${d}` });
        for (const g of gekozen) {
          gebruikt.push(g.exercise_id);
          const p = patroonVan(BREED.find((x) => x.id === g.exercise_id));
          if (p) patronen.add(p);
        }
      });
      expect(patronen.has("hurk") || patronen.has("scharnier")).toBe(true);
      expect(patronen.has("duw_horizontaal") || patronen.has("duw_verticaal")).toBe(true);
      expect(patronen.has("trek_horizontaal") || patronen.has("trek_verticaal")).toBe(true);
    });
  }

  it("binnen één sessie komt hetzelfde patroon niet twee keer", () => {
    // Een dag met een squat én een leg press traint hetzelfde en laat het scharnier ongemoeid.
    const blokken = [
      { categorie: "benen", mechanic: "compound", sectie: "Hoofdoefening", sets: 3, reps: 8, rust: 120 },
      { categorie: "benen", mechanic: "compound", sectie: "Accessoire", sets: 3, reps: 10, rust: 90 },
    ];
    const { gekozen } = kiesOefeningen(blokken, BREED, { niveau: "soms", zaad: "spreiding" });
    const p = gekozen.map((g) => patroonVan(BREED.find((x) => x.id === g.exercise_id)));
    expect(p[0]).toBeTruthy();
    if (p[1]) expect(p[1]).not.toBe(p[0]);
  });
});
