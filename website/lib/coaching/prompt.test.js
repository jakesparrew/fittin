import { describe, it, expect } from "vitest";
import { leeftijdsklasse, bouwContext, contextTekst, planSysteem, analyseSysteem, herplanSysteem, planVraag, analyseVraag } from "./prompt.js";

const NU = new Date("2026-09-10T12:00:00Z");

// Een volledig profiel zoals het uit de databank komt — inclusief alles wat er NIET uit mag.
const PROFIEL = {
  id: "abc",
  full_name: "Jan Vermeulen",
  email: "jan.vermeulen@example.com",
  phone: "+32 470 12 34 56",
  geboortedatum: "1988-04-12",
  geslacht: "Man",
  gewicht_kg: 82.5,
  coaching_doel: "sterker",
  coaching_ervaring: "soms",
  coaching_dagen: 3,
  coaching_beperkingen: "lage rug, voorzichtig met deadlift",
  coaching_toon: "scherp",
  coaching_toestemming_at: "2026-09-01T10:00:00Z",
};

describe("de belangrijkste grens: wat mag er de deur uit", () => {
  it("geen naam, e-mail of telefoonnummer in de context", () => {
    const c = bouwContext(PROFIEL, { nu: NU });
    const alles = JSON.stringify(c) + contextTekst(c) + analyseVraag(c, { week: 2, afgevinkt: 3, gepland: 3, besluit: "door", besluitReden: "af" });
    expect(alles).not.toMatch(/Jan/);
    expect(alles).not.toMatch(/Vermeulen/);
    expect(alles).not.toMatch(/@example\.com/);
    expect(alles).not.toMatch(/470/);
    expect(alles).not.toMatch(/\babc\b/); // ook geen interne id
  });

  it("geen exacte geboortedatum — alleen een klasse", () => {
    const c = bouwContext(PROFIEL, { nu: NU });
    expect(JSON.stringify(c)).not.toMatch(/1988-04-12/);
    expect(c.leeftijdsklasse).toBe("30-39");
  });
});

describe("toestemming is de enige sleutel", () => {
  it("zonder toestemming gaan gewicht, leeftijd en beperkingen niet mee", () => {
    const zonder = bouwContext({ ...PROFIEL, coaching_toestemming_at: null }, { nu: NU });
    expect(zonder.gewichtKg).toBeUndefined();
    expect(zonder.leeftijdsklasse).toBeUndefined();
    expect(zonder.beperkingen).toBeUndefined();
    expect(zonder.geslacht).toBeUndefined();
    // en het doel en de ervaring blijven wél — daar is geen art. 9 voor nodig
    expect(zonder.doel).toMatch(/sterker/);
  });

  it("zegt het model expliciet dat de gegevens ontbreken, zodat het niet gaat gokken", () => {
    const zonder = bouwContext({ ...PROFIEL, coaching_toestemming_at: null }, { nu: NU });
    expect(contextTekst(zonder)).toMatch(/GEEN toestemming/);
  });

  it("mét toestemming gaan ze wel mee", () => {
    const c = bouwContext(PROFIEL, { nu: NU });
    expect(c.gewichtKg).toBe(82.5);
    expect(contextTekst(c)).toMatch(/lage rug/);
  });

  it("kapt een lange beperkingentekst af", () => {
    const lang = { ...PROFIEL, coaching_beperkingen: "x".repeat(2000) };
    expect(bouwContext(lang, { nu: NU }).beperkingen.length).toBe(500);
  });
});

describe("leeftijdsklasse", () => {
  it("valt in de juiste band", () => {
    expect(leeftijdsklasse("2010-01-01", NU)).toBe("onder 18");
    expect(leeftijdsklasse("2000-01-01", NU)).toBe("18-29");
    expect(leeftijdsklasse("1988-04-12", NU)).toBe("30-39");
    expect(leeftijdsklasse("1980-01-01", NU)).toBe("40-49");
    expect(leeftijdsklasse("1955-01-01", NU)).toBe("60+");
  });
  it("telt de verjaardag pas als ze geweest is", () => {
    expect(leeftijdsklasse("1996-09-11", NU)).toBe("18-29"); // wordt morgen 30
    expect(leeftijdsklasse("1996-09-10", NU)).toBe("30-39"); // vandaag jarig
  });
  it("geeft null bij onzin", () => {
    expect(leeftijdsklasse(null, NU)).toBe(null);
    expect(leeftijdsklasse("12/04/1988", NU)).toBe(null);
  });
});

describe("de systeemprompts", () => {
  it("dragen alle drie dezelfde vaste grenzen", () => {
    for (const p of [planSysteem(), analyseSysteem(), herplanSysteem()]) {
      expect(p).toMatch(/GEEN medisch advies/);
      expect(p).toMatch(/pijn/i);
      expect(p).toMatch(/Nederlands/);
    }
  });

  it("verbieden het model expliciet om oefeningen te verzinnen", () => {
    // Dit is de tekstuele kant van wat lib/coaching/keuze.js structureel afdwingt.
    expect(planSysteem()).toMatch(/verzint NOOIT oefeningen/);
  });

  it("vragen om JSON zonder codeblok — anders faalt het parsen", () => {
    expect(planSysteem()).toMatch(/zonder codeblok/);
    expect(herplanSysteem()).toMatch(/ALLEEN geldige JSON/);
  });

  it("de analyse vraagt om tekst, niet om JSON", () => {
    expect(analyseSysteem()).toMatch(/ALLEEN die tekst/);
    expect(analyseSysteem()).not.toMatch(/JSON/);
  });
});

describe("de vragen aan het model", () => {
  const c = bouwContext(PROFIEL, { nu: NU });

  it("noemt het aantal weken en sessies", () => {
    const v = planVraag(c, { weken: 8, sessiesPerWeek: 3 });
    expect(v).toMatch(/8 weken/);
    expect(v).toMatch(/3 sessies per week/);
    expect(v).toMatch(/barbells/);
  });

  it("geeft de vorige analyses mee — dat is het geheugen", () => {
    const v = analyseVraag(c, {
      week: 4, afgevinkt: 2, gepland: 3, besluit: "inkorten", besluitReden: "meer dan de helft",
      vorigeAnalyses: [{ week: 2, tekst: "rustig gestart" }, { week: 3, tekst: "squat omhoog" }],
      checkin: { zwaarte: "goed", verloop: "wisselend", energie: "laag", pijn: false },
      aanpassingen: ["squat 60 → 62,5 kg"],
    });
    expect(v).toMatch(/week 2: rustig gestart/);
    expect(v).toMatch(/week 3: squat omhoog/);
    expect(v).toMatch(/2 van 3 sessies/);
    expect(v).toMatch(/squat 60 → 62,5 kg/);
  });

  it("zegt het eerlijk als er geen check-in was", () => {
    const v = analyseVraag(c, { week: 2, afgevinkt: 0, gepland: 3, besluit: "herhaal", besluitReden: "te weinig" });
    expect(v).toMatch(/geen check-in/i);
  });

  it("meldt pijn nadrukkelijk", () => {
    const v = analyseVraag(c, {
      week: 2, afgevinkt: 3, gepland: 3, besluit: "aanpassen", besluitReden: "pijn",
      checkin: { pijn: true, pijn_waar: "linkerknie" },
    });
    expect(v).toMatch(/PIJN gemeld: linkerknie/);
  });
});
