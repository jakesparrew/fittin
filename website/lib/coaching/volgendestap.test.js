import { describe, it, expect } from "vitest";
import { volgendeStap, dagenTeGaan, verschilTekst } from "./volgendestap.js";

// Wat er op het coachingscherm bovenaan hoort te staan. Dit is de belangrijkste beslissing van dat
// scherm: zonder geboekt moment gebeurt er niets — geen zaal, geen deurcode, geen workout in de
// mail — en toch stond "boek je sessie" er als tekstlink onder een streep.
//
// De klok komt hier als parameter binnen. Dat is geen testgemak maar een eis: WeekPaneel is een
// client component, en een klok die tijdens het renderen gelezen wordt, geeft hydratatiefout #418.

const UUR = 3600000;
const NU = new Date("2026-09-10T12:00:00Z").getTime();
const boeking = (urenVanaf) => ({ id: `b${urenVanaf}`, starts_at: new Date(NU + urenVanaf * UUR).toISOString() });
const sessie = (gedaan) => ({ id: Math.random().toString(36), gedaan_at: gedaan ? "2026-09-09T10:00:00Z" : null });

describe("de volgende stap op het coachingscherm", () => {
  it("wie nog niets deed en niets boekte, krijgt boeken als enige handeling", () => {
    const s = volgendeStap({ sessies: [sessie(false), sessie(false), sessie(false)], boekingen: [], nu: NU });
    expect(s.soort).toBe("boeken");
    expect(s.titel).toBe("Boek je eerste sessie");
    expect(s.knop.href).toBe("/boeken");
    expect(s.stil).toBeFalsy(); // dit is de luide toestand — hier valt het plan stil
  });

  it("meldt het tekort wanneer er minder momenten geboekt zijn dan er sessies open staan", () => {
    const s = volgendeStap({ sessies: [sessie(true), sessie(false), sessie(false)], boekingen: [boeking(24)], nu: NU });
    expect(s.soort).toBe("boeken");
    expect(s.titel).toMatch(/Nog 1 moment/);
    expect(s.tekst).toMatch(/2 sessies/);
  });

  it("boekingen in het VERLEDEN tellen niet mee als geboekt moment", () => {
    // De val: een lid met drie sessies dat vorige week één keer kwam, heeft nog steeds niets
    // gepland. Tellen we alle boekingen mee, dan zegt het scherm dat alles geregeld is.
    const s = volgendeStap({ sessies: [sessie(false), sessie(false)], boekingen: [boeking(-48), boeking(-2)], nu: NU });
    expect(s.soort).toBe("boeken");
  });

  it("wie alles geboekt heeft, krijgt geen knop maar een datum", () => {
    const s = volgendeStap({ sessies: [sessie(false), sessie(false)], boekingen: [boeking(6), boeking(72)], nu: NU });
    expect(s.soort).toBe("gepland");
    expect(s.knop).toBeNull();
    expect(s.boeking.id).toBe("b6"); // de eerstvolgende, niet zomaar de eerste uit de lijst
  });

  it("een afgewerkte week zonder check-in wijst naar het formulier, niet naar boeken", () => {
    const s = volgendeStap({ sessies: [sessie(true), sessie(true)], boekingen: [], checkin: false, magCheckin: true, nu: NU });
    expect(s.soort).toBe("checkin");
    expect(s.knop.href).toBe("#checkin");
  });

  it("een afgewerkte week waarvan de check-in nog niet open staat, duwt nergens naartoe", () => {
    const s = volgendeStap({ sessies: [sessie(true)], boekingen: [], checkin: false, magCheckin: false, nu: NU });
    expect(s.knop).toBeNull();
    expect(s.stil).toBe(true);
  });

  it("alles af én check-in ingevuld: dan is zondag aan zet en het scherm zwijgt", () => {
    const s = volgendeStap({ sessies: [sessie(true)], boekingen: [], checkin: true, nu: NU });
    expect(s.soort).toBe("klaar");
    expect(s.tekst).toMatch(/[Zz]ondag/);
    expect(s.stil).toBe(true);
  });

  it("de laatste week krijgt een ander slot dan een gewone week", () => {
    const s = volgendeStap({ sessies: [sessie(true)], boekingen: [], checkin: true, laatsteWeek: true, nu: NU });
    expect(s.titel).toMatch(/laatste week/);
  });

  it("noemt de boeking nooit als de week nog te doen is maar er niets geboekt staat", () => {
    const s = volgendeStap({ sessies: [sessie(false)], boekingen: [], nu: NU });
    expect(s.boeking).toBeUndefined();
  });
});

describe("hoeveel dagen deze week nog loopt", () => {
  it("telt af vanaf het moment dat de week openging", () => {
    expect(dagenTeGaan(new Date(NU - 2 * 86400000).toISOString(), NU)).toBe(5);
    expect(dagenTeGaan(new Date(NU).toISOString(), NU)).toBe(7);
  });

  it("gaat nooit onder nul — een week die al te lang open staat is gewoon rond", () => {
    expect(dagenTeGaan(new Date(NU - 20 * 86400000).toISOString(), NU)).toBe(0);
  });

  it("geeft null voor een week die nog niet open staat", () => {
    expect(dagenTeGaan(null, NU)).toBeNull();
  });
});

describe("wat je vinkje deed", () => {
  it("toont de verandering in herhalingen", () => {
    expect(verschilTekst({ sets: 3, reps: 11 }, { sets: 3, reps: 10 })).toBe("10 → 11 herhalingen");
  });

  it("toont een lichtere week ook — niet alleen vooruitgang", () => {
    expect(verschilTekst({ sets: 2, reps: 8 }, { sets: 3, reps: 10 })).toBe("10 → 8 herhalingen · 3 → 2 reeksen");
  });

  it("zwijgt wanneer er niets veranderde", () => {
    expect(verschilTekst({ sets: 3, reps: 10 }, { sets: 3, reps: 10 })).toBeNull();
  });

  it("zwijgt in week 1, want er is geen vorige week", () => {
    expect(verschilTekst({ sets: 3, reps: 10 }, undefined)).toBeNull();
  });

  it("verzint geen verschil uit een ontbrekend gewicht", () => {
    // AI-plannen hebben geen streefgewicht. `null → null` mag nooit als verandering lezen.
    expect(verschilTekst({ sets: 3, reps: 10, kg: null }, { sets: 3, reps: 10, kg: null })).toBeNull();
  });
});

describe("randgevallen die eerder door de takken vielen", () => {
  it("een week zonder sessies krijgt een eigen tak, niet 'alles staat geboekt'", () => {
    // Viel eerder door naar tak 3: `teDoen` is 0, dus tekort <= 0. Het scherm zei dan "je volgende
    // sessie staat geboekt" bij nul sessies en nul boekingen — de rustigste zin op het drukste
    // moment, met een lege kaart eronder.
    const s = volgendeStap({ sessies: [], boekingen: [], nu: NU });
    expect(s.soort).toBe("leeg");
    expect(s.knop).toBeTruthy();
    expect(s.stil).toBeFalsy();
  });

  it("een lege week wordt niet als afgewerkte week gelezen", () => {
    const s = volgendeStap({ sessies: [], boekingen: [], checkin: false, magCheckin: true, nu: NU });
    expect(s.soort).not.toBe("checkin");
    expect(s.soort).not.toBe("klaar");
  });

  it("belooft nooit meer dagen dan het venster, ook niet vlak na het openen", () => {
    // Een week die net openging kreeg "nog 7 dagen", maar de cron werkt hem pas af als hij zes
    // dagen loopt en draait alleen op zondag.
    expect(dagenTeGaan(new Date(NU + 3600000).toISOString(), NU)).toBeLessThanOrEqual(7);
    expect(dagenTeGaan(new Date(NU).toISOString(), NU)).toBe(7);
  });
});
