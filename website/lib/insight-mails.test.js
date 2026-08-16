import { describe, it, expect } from "vitest";
import { aboMath, magOpnieuw, buildAboVoorstel, TARGET_DRIPS, HERHAAL_DAGEN } from "./insight-mails.js";

// De rekensom is het hele overtuigingsargument: "jij betaalde € X, met abo was dat € Y".
// Eén fout cijfer in zo'n mail en het vertrouwen is weg — vandaar vaste voorbeelden.
describe("aboMath", () => {
  it("rekent het standaardvoorbeeld exact voor (4 losse sessies/maand)", () => {
    // 8 losse sessies in 60 dagen = 4/maand. Los: € 60/mnd. Abo: 12×4 = € 48/mnd.
    const m = aboMath({ los: 8, kaart: 0 });
    expect(m.perMaand).toBe(4);
    expect(m.kostNuMaand).toBe(6000);
    expect(m.kostAboMaand).toBe(4800);
    expect(m.besparingMaand).toBe(1200);
    expect(m.besparingJaar).toBe(14400);
  });

  it("rekent kaartsessies aan de échte kaartprijs (€ 150 voor 11), niet aan € 15", () => {
    const m = aboMath({ los: 0, kaart: 11 });
    // 11 kaartsessies kostten exact € 150 → € 75/mnd; abo: 5,5 × 12 = € 66.
    expect(m.kostNuMaand).toBe(7500);
    expect(m.kostAboMaand).toBe(6600);
  });

  it("toont nooit een negatieve besparing — dan is de mail geen leugen maar een ander verhaal", () => {
    // 1 sessie in 60 dagen = 0,5/mnd: los € 7,50, abo minimaal € 12 → abo is duurder.
    const m = aboMath({ los: 1, kaart: 0 });
    expect(m.kostAboMaand).toBe(1200); // de vaste maandprijs is de bodem
    expect(m.besparingMaand).toBe(0);
  });

  it("houdt halve sessieaantallen leesbaar (7 sessies → 3,5/mnd)", () => {
    expect(aboMath({ los: 7, kaart: 0 }).perMaand).toBe(3.5);
  });
});

describe("magOpnieuw", () => {
  const nu = new Date("2026-08-16T12:00:00Z");
  it("blokkeert binnen de herhaaltermijn en laat erna weer toe", () => {
    expect(magOpnieuw("2026-08-01T12:00:00Z", nu)).toBe(false);
    expect(magOpnieuw("2026-07-01T12:00:00Z", nu)).toBe(true);
    expect(magOpnieuw(null, nu)).toBe(true);
  });
  it("kantelt precies op de grens van 30 dagen", () => {
    expect(HERHAAL_DAGEN).toBe(30);
    expect(magOpnieuw("2026-07-17T12:00:00.001Z", nu)).toBe(false);
    expect(magOpnieuw("2026-07-17T11:59:59Z", nu)).toBe(true);
  });
});

describe("buildAboVoorstel", () => {
  it("zet de eigen cijfers van het lid in de mail", () => {
    const mail = buildAboVoorstel({ name: "Floris Brugmans", math: aboMath({ los: 8, kaart: 0 }) });
    expect(mail.subject).toContain("Floris");
    expect(mail.body).toContain("€ 60,00");   // wat hij nu betaalt per maand
    expect(mail.body).toContain("€ 48,00");   // met abo
    expect(mail.body).toContain("€ 12,00");   // besparing per maand
    expect(mail.kind).toBe("insight_abo_voorstel");
  });

  it("belooft bij een laag ritme géén besparing maar een eerlijk alternatief", () => {
    const mail = buildAboVoorstel({ name: "Test", math: aboMath({ los: 1, kaart: 0 }) });
    expect(mail.body).not.toContain("goedkoper");
    expect(mail.body).toContain("€ 12 in plaats van € 15");
  });
});

describe("TARGET_DRIPS", () => {
  it("heeft de twee reeksen met oplopende vertragingen en overal een CTA-link", () => {
    for (const key of ["abo_reeks", "comeback_reeks"]) {
      const d = TARGET_DRIPS[key];
      expect(d.steps.length).toBeGreaterThanOrEqual(2);
      let vorige = -1;
      for (const s of d.steps) {
        expect(s.delay_hours).toBeGreaterThan(vorige);
        vorige = s.delay_hours;
        expect(s.body_html).toMatch(/href="https?:\/\//);
        expect(s.subject.length).toBeGreaterThan(8);
      }
      // De eerste mail vertrekt meteen — wie op de knop duwt, wil vandaag iets zien vertrekken.
      expect(d.steps[0].delay_hours).toBe(0);
    }
  });
});
