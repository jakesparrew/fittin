import { describe, it, expect } from "vitest";
import {
  stapVoor, volgendGewicht, volgendeHerhalingen, schuifOefening,
  weekBesluit, isRustweek, reeksAanHetEind, volgendeWeek, RUSTWEEK_DEEL, raaktPijn, noemtEenPlek,
  dempOordeel, uitgeput,
} from "./progressie.js";

// Dit bestand is de garantie dat de opvolging zonder AI klopt. Elke test legt een keuze vast die
// anders stilletjes zou verschuiven, en de meeste gaan over de RANDEN — daar gaat progressie mis:
// een halter van 5 kg die plots 7,5 wordt, een lid dat eeuwig op hetzelfde gewicht blijft staan,
// of een poort die iemand buitensluit die griep had.

describe("stapgrootte hangt af van het gewicht", () => {
  it("schaalt mee in plaats van overal +2,5 te doen", () => {
    // +2,5 op 5 kg is 50% erbij. Dat is geen progressie maar een blessure.
    expect(stapVoor(5)).toBe(1);
    expect(stapVoor(20)).toBe(2);
    expect(stapVoor(60)).toBe(2.5);
    expect(stapVoor(120)).toBe(2.5);
  });
  it("geeft 0 terug voor iets zonder gewicht", () => {
    expect(stapVoor(null)).toBe(0);
    expect(stapVoor(0)).toBe(0);
  });
});

describe("gewicht na een oordeel", () => {
  it("gaat omhoog bij te licht", () => {
    expect(volgendGewicht(60, "te_licht")).toBe(62.5);
    expect(volgendGewicht(8, "te_licht")).toBe(9);
  });

  it("blijft staan bij goed", () => {
    expect(volgendGewicht(60, "goed")).toBe(60);
  });

  it("duwt tóch op na drie keer goed — anders sta je drie weken stil", () => {
    expect(volgendGewicht(60, "goed", 3)).toBe(62.5);
    expect(volgendGewicht(60, "goed", 2)).toBe(60);
  });

  it("stapt verder terug dan vooruit bij te zwaar", () => {
    // 10% eraf, want wie zich vertilt heeft een echte stap terug nodig, geen halve.
    expect(volgendGewicht(100, "te_zwaar")).toBe(90);
    expect(volgendGewicht(30, "te_zwaar")).toBe(27); // 10% = 3, meer dan de stap van 2,5
  });

  it("zakt nooit minder dan één stap, ook als 10% kleiner is", () => {
    // Bij 12 kg is 10% maar 1,2 — dan zou "10% eraf" nauwelijks verschil maken en zou het lid
    // volgende week opnieuw te zwaar tillen. De stap is dan de ondergrens.
    expect(volgendGewicht(12, "te_zwaar")).toBe(10);
  });

  it("zakt niet onder de lege stang als je daarboven zat", () => {
    expect(volgendGewicht(22, "te_zwaar")).toBe(20);
    expect(volgendGewicht(21, "te_zwaar")).toBe(20);
  });

  it("valt altijd op een halve kilo — de zaal heeft geen kleinere schijven", () => {
    for (const kg of [7, 13, 37, 63, 101]) {
      for (const o of ["te_licht", "goed", "te_zwaar"]) {
        const uit = volgendGewicht(kg, o);
        expect(uit * 2, `${kg} kg na ${o} gaf ${uit}`).toBe(Math.round(uit * 2));
      }
    }
  });

  it("geeft null bij een oefening zonder gewicht", () => {
    expect(volgendGewicht(null, "te_licht")).toBe(null);
    expect(volgendGewicht(0, "te_licht")).toBe(null);
  });
});

describe("herhalingen bij oefeningen zonder gewicht", () => {
  it("stijgt met één bij te licht", () => {
    expect(volgendeHerhalingen(10, "te_licht", 10)).toBe(11);
  });

  it("stopt bij vier boven het startpunt — anders wordt kracht stilletjes uithouding", () => {
    expect(volgendeHerhalingen(14, "te_licht", 10)).toBe(14);
  });

  it("zakt twee bij te zwaar maar niet onder 60% van de start", () => {
    expect(volgendeHerhalingen(12, "te_zwaar", 12)).toBe(10);
    // Ondergrens bij een start van 12 is 7 (60%). Vanaf 8 zakt hij dus tot die bodem, niet twee erbij.
    expect(volgendeHerhalingen(8, "te_zwaar", 12)).toBe(7);
    expect(volgendeHerhalingen(7, "te_zwaar", 12)).toBe(7); // en blijft daar
  });

  it("zakt nooit onder vier", () => {
    expect(volgendeHerhalingen(5, "te_zwaar", 5)).toBe(4);
  });
});

describe("één oefening vooruitschuiven", () => {
  const basis = { id: "x", sets: 3, reps: 10, rep_text: null, target_weight_kg: 40, start_reps: 10 };

  it("verlegt het gewicht en zegt waarom", () => {
    const uit = schuifOefening(basis, { oordeel: "te_licht" });
    expect(uit.target_weight_kg).toBe(42.5);
    expect(uit.aangepast).toBe(true);
    expect(uit.reden).toMatch(/40 → 42.5 kg/);
  });

  it("pijn haalt de oefening eruit in plaats van ze lichter te maken", () => {
    const uit = schuifOefening(basis, { oordeel: "te_licht", pijn: true });
    expect(uit.vervangen).toBe(true);
    expect(uit.reden).toMatch(/pijn/);
    // en het gewicht is NIET stilletjes opgehoogd
    expect(uit.target_weight_kg).toBe(40);
  });

  it("laat een vrij voorschrift met rust", () => {
    const vrij = { ...basis, target_weight_kg: null, reps: null, rep_text: "zo veel mogelijk" };
    const uit = schuifOefening(vrij, { oordeel: "te_licht" });
    expect(uit.aangepast).toBe(false);
    expect(uit.rep_text).toBe("zo veel mogelijk");
  });

  it("gebruikt herhalingen wanneer er geen gewicht is", () => {
    const zonder = { ...basis, target_weight_kg: null };
    expect(schuifOefening(zonder, { oordeel: "te_licht" }).reps).toBe(11);
  });
});

describe("het besluit over een week — de poort", () => {
  const s = (o) => weekBesluit({ gepland: 3, afgevinkt: 0, checkinIngevuld: true, pijn: false, teZwaarWeken: 0, ...o });

  it("alles af → door", () => {
    expect(s({ afgevinkt: 3 }).besluit).toBe("door");
  });

  it("meer dan de helft → inkorten, niet blokkeren", () => {
    expect(s({ afgevinkt: 2 }).besluit).toBe("inkorten");
    expect(s({ afgevinkt: 2 }).reden).toMatch(/korter/);
  });

  it("minder dan de helft → dezelfde week nog eens", () => {
    expect(s({ afgevinkt: 1 }).besluit).toBe("herhaal");
  });

  it("niets gedaan en niets laten weten → eerst vragen of het moet pauzeren", () => {
    // Dit is het verschil tussen een coach en een to-do-lijst: niet doorduwen, maar vragen.
    expect(s({ afgevinkt: 0, checkinIngevuld: false }).besluit).toBe("pauze_vragen");
  });

  it("niets gedaan maar wél een check-in ingevuld → gewoon herhalen", () => {
    expect(s({ afgevinkt: 0, checkinIngevuld: true }).besluit).toBe("herhaal");
  });

  it("pijn gaat vóór het rekenwerk", () => {
    expect(s({ afgevinkt: 3, pijn: true }).besluit).toBe("aanpassen");
  });

  it("drie weken te zwaar is geen progressieprobleem meer maar een coachvraag", () => {
    expect(s({ afgevinkt: 3, teZwaarWeken: 3 }).besluit).toBe("doorverwijzen");
  });

  it("telt nooit meer afgevinkt dan gepland", () => {
    expect(weekBesluit({ gepland: 2, afgevinkt: 9, checkinIngevuld: true }).besluit).toBe("door");
  });
});

describe("rustweken", () => {
  it("elke vierde week, maar nooit de laatste", () => {
    expect(isRustweek(4, 8)).toBe(true);
    expect(isRustweek(8, 8)).toBe(false); // eindigen doe je op je sterkst
    expect(isRustweek(4, 12)).toBe(true);
    expect(isRustweek(3, 8)).toBe(false);
  });
  it("niet in een kort plan — dat zou een kwart van het plan zijn", () => {
    expect(isRustweek(4, 4)).toBe(false);
  });
  it("heeft een deel dat de generator kan gebruiken", () => {
    expect(RUSTWEEK_DEEL).toBeGreaterThan(0.4);
    expect(RUSTWEEK_DEEL).toBeLessThan(0.8);
  });
});

describe("reeks aan het eind", () => {
  it("telt terug tot het eerste andere oordeel", () => {
    expect(reeksAanHetEind(["goed", "te_zwaar", "goed", "goed", "goed"], "goed")).toBe(3);
    expect(reeksAanHetEind(["goed", "goed", "te_licht"], "goed")).toBe(0);
    expect(reeksAanHetEind([], "goed")).toBe(0);
    expect(reeksAanHetEind(null, "goed")).toBe(0);
  });
});

describe("de volledige weekovergang", () => {
  const voorschriften = [
    { id: "a", sets: 3, reps: 10, rep_text: null, target_weight_kg: 40, start_reps: 10 },
    { id: "b", sets: 3, reps: 12, rep_text: null, target_weight_kg: null, start_reps: 12 },
  ];

  it("schuift alles op bij een afgewerkte week", () => {
    const uit = volgendeWeek(voorschriften, { a: { oordeel: "te_licht" }, b: { oordeel: "te_licht" } },
      { gepland: 3, afgevinkt: 3, checkinIngevuld: true });
    expect(uit.besluit).toBe("door");
    expect(uit.oefeningen[0].target_weight_kg).toBe(42.5);
    expect(uit.oefeningen[1].reps).toBe(13);
    expect(uit.modelNodig).toBe(false);
  });

  it("laat bij herhalen ALLES staan — je doet dezelfde week, niet een zwaardere", () => {
    const uit = volgendeWeek(voorschriften, { a: { oordeel: "te_licht" } },
      { gepland: 3, afgevinkt: 1, checkinIngevuld: true });
    expect(uit.besluit).toBe("herhaal");
    expect(uit.oefeningen[0].target_weight_kg).toBe(40);
    expect(uit.oefeningen.every((o) => o.aangepast === false)).toBe(true);
  });

  it("vraagt om een model wanneer er een keuze te maken valt, niet een som", () => {
    expect(volgendeWeek(voorschriften, {}, { gepland: 3, afgevinkt: 3, checkinIngevuld: true, pijn: true }).modelNodig).toBe(true);
    expect(volgendeWeek(voorschriften, {}, { gepland: 3, afgevinkt: 3, checkinIngevuld: true, teZwaarWeken: 3 }).modelNodig).toBe(true);
    // en juist NIET bij het gewone geval — dat is de hele bedoeling
    expect(volgendeWeek(voorschriften, {}, { gepland: 3, afgevinkt: 3, checkinIngevuld: true }).modelNodig).toBe(false);
  });

  it("werkt met een lege seinenlijst — wie niets aantikte, krijgt gewoon hetzelfde", () => {
    const uit = volgendeWeek(voorschriften, {}, { gepland: 3, afgevinkt: 3, checkinIngevuld: true });
    expect(uit.oefeningen[0].target_weight_kg).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Pijn hoort bij een PLEK, niet bij een week
// ---------------------------------------------------------------------------
// Deze groep bestaat omdat één weekbrede pijnvlag ooit het volledige schema verving: vinkte een
// lid "ik had ergens pijn" aan, dan werd elke oefening van de week erna vervangen — ook de
// oefeningen die niets met die plek te maken hadden.

describe("pijn koppelen aan een plek", () => {
  it("herkent gewone Vlaamse omschrijvingen en koppelt ze aan de juiste categorie", () => {
    expect(raaktPijn("benen", "mijn linkerknie doet zeer")).toBe(true);
    expect(raaktPijn("schouders", "rechterschouder")).toBe(true);
    expect(raaktPijn("rug", "lage rug")).toBe(true);
    expect(raaktPijn("armen", "elleboog")).toBe(true);
    expect(raaktPijn("core", "buik")).toBe(true);
    expect(raaktPijn("borst", "ribben")).toBe(true);
  });

  it("raakt de andere categorieën NIET", () => {
    expect(raaktPijn("borst", "mijn linkerknie doet zeer")).toBe(false);
    expect(raaktPijn("armen", "lage rug")).toBe(false);
    expect(raaktPijn("benen", "schouder")).toBe(false);
  });

  it("vervangt niets wanneer het lid geen plek noemde", () => {
    // De veilige kant: liever een week te licht dan een schema dat zonder aanleiding omgegooid wordt.
    for (const leeg of ["", "   ", null, undefined]) {
      expect(raaktPijn("benen", leeg)).toBe(false);
      expect(noemtEenPlek(leeg)).toBe(false);
    }
  });

  it("vervangt niets bij tekst die geen lichaamsdeel noemt", () => {
    expect(noemtEenPlek("het ging gewoon niet deze week")).toBe(false);
    expect(raaktPijn("benen", "het ging gewoon niet deze week")).toBe(false);
  });

  it("kijkt niet naar hoofdletters of categorie-notatie", () => {
    expect(raaktPijn("BENEN", "KNIE")).toBe(true);
  });

  it("gaat om met een onbekende categorie", () => {
    expect(raaktPijn(null, "knie")).toBe(false);
    expect(raaktPijn("verzonnen", "knie")).toBe(false);
  });
});

describe("aanhoudende pijn gaat naar een mens", () => {
  const basis = { gepland: 3, afgevinkt: 3, checkinIngevuld: true };

  it("verwijst door na drie weken op rij pijn", () => {
    expect(weekBesluit({ ...basis, pijn: true, pijnWeken: 3 }).besluit).toBe("doorverwijzen");
  });

  it("past daarvóór alleen aan", () => {
    expect(weekBesluit({ ...basis, pijn: true, pijnWeken: 1 }).besluit).toBe("aanpassen");
    expect(weekBesluit({ ...basis, pijn: true, pijnWeken: 2 }).besluit).toBe("aanpassen");
  });

  it("laat een week zonder pijn de reeks breken", () => {
    // reeksAanHetEind telt vanaf het einde, dus dit hangt aan de aanroeper; hier bewaken we alleen
    // dat een nul-reeks niet doorverwijst.
    expect(weekBesluit({ ...basis, pijn: false, pijnWeken: 0 }).besluit).toBe("door");
  });
});

describe("uitputting: het duwtje vervalt, het volume niet", () => {
  // Het gat dat dit dicht: de ENIGE manier om een lichtere week te krijgen was niet komen opdagen.
  // Wie alles afwerkte en "energie: laag" aankruiste, kreeg de week erna gewoon meer — want die
  // twee antwoorden werden bewaard en door niets gelezen.

  it("herkent een lege week aan energie of verloop", () => {
    expect(uitgeput({ energie: "laag" })).toBe(true);
    expect(uitgeput({ verloop: "moeilijk" })).toBe(true);
    expect(uitgeput({ energie: "goed", verloop: "vlot" })).toBe(false);
    expect(uitgeput(null)).toBe(false);
  });

  it("laat 'te licht' die week gelden als 'goed' — geen extra herhalingen op een lege batterij", () => {
    expect(dempOordeel("te_licht", { energie: "laag" })).toBe("goed");
    expect(dempOordeel("te_licht", { verloop: "moeilijk" })).toBe("goed");
  });

  it("laat 'te zwaar' staan — dat is een STERKER signaal dan uitputting en moet blijven werken", () => {
    expect(dempOordeel("te_zwaar", { energie: "laag" })).toBe("te_zwaar");
  });

  it("verandert niets aan een gewone week", () => {
    expect(dempOordeel("te_licht", { energie: "goed", verloop: "vlot" })).toBe("te_licht");
    expect(dempOordeel("goed", {})).toBe("goed");
  });

  it("neemt het volume NIET af — dat zou zich elke week herhalen en naar nul spiralen", () => {
    // Elke week wordt uit de vorige gebouwd. Wie hier een factor invoert, moet eerst uitrekenen
    // waar iemand na zes moeilijke weken staat.
    const licht = schuifOefening({ sets: 3, reps: 10, target_weight_kg: null, start_reps: 10 },
      { oordeel: dempOordeel("te_licht", { energie: "laag" }), reeksGoed: 0 });
    expect(licht.sets).toBe(3);
    expect(licht.reps).toBe(10);
  });
});
