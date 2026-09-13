import { describe, it, expect } from "vitest";
import { aboMath, magOpnieuw, buildAboVoorstel, TARGET_DRIPS, HERHAAL_DAGEN, teltVoorAbo } from "./insight-mails.js";

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

// teltVoorAbo — de regel die bepaalt wie "abo-kandidaat" is. Ze stond in vier bestanden apart en
// drie daarvan misten de prijscontrole, waardoor sessies die de coach betaalde meetelden. Als dit
// scheef staat, mailen we mensen een besparing op geld dat ze nooit uitgaven.
describe("teltVoorAbo", () => {
  it("telt een betaalde losse sessie", () => {
    expect(teltVoorAbo({ payment_source: "los", price_cents: 1500, paid: true })).toBe(true);
  });
  it("telt een beurtenkaart, ook al staat de prijs op 0", () => {
    expect(teltVoorAbo({ payment_source: "credit", price_cents: 0, paid: true })).toBe(true);
  });
  it("telt NIET wat de coach betaalde (los à € 0)", () => {
    expect(teltVoorAbo({ payment_source: "los", price_cents: 0, paid: true })).toBe(false);
  });
  it("telt NIET een nog onbetaalde losse sessie", () => {
    expect(teltVoorAbo({ payment_source: "los", price_cents: 1500, paid: false })).toBe(false);
  });
  it("telt NIET een abo- of welkomstsessie", () => {
    expect(teltVoorAbo({ payment_source: "abo", price_cents: 1200, paid: true })).toBe(false);
    expect(teltVoorAbo({ payment_source: "gratis_code", price_cents: 0, paid: true })).toBe(false);
  });
  it("valt niet over niets", () => {
    expect(teltVoorAbo(null)).toBe(false);
  });
});

describe("een overtuigingskaart komt niet terug nadat je erop handelde", () => {
  // 13-09: de beheerder zag Julio en Arne opnieuw als "Abo-kandidaat" staan, terwijl hij ze al
  // gemaild had. De kaart verdween alleen via "Verberg"; na een mail bleef hij staan en nodigde hij
  // uit tot een tweede klik — en na 30 dagen gaat de mailrem open.
  const fs = require("node:fs");
  const path = require("node:path");
  const lees = (p) => fs.readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

  it("het dashboard filtert op wat er echt vertrok, niet alleen op 'Verberg'", () => {
    const p = lees("app/beheer/page.jsx");
    for (const kaart of ["pastdue", "opzeg", "abo_kandidaat"]) {
      expect(p.includes(`open("${kaart}"`), kaart).toBe(true);
    }
    expect(p).toMatch(/from\("email_log"\)[\s\S]{0,120}like\("kind", "insight_%"\)/);
    // drip_enrollments heeft geen created_at; met die kolom gaf PostgREST een fout en vond de
    // reeks-check stilletjes niemand.
    expect(p).toMatch(/gte\("enrolled_at"/);
  });

  it("afkappen op vijf gebeurt NA het wegfilteren", () => {
    expect(lees("app/beheer/page.jsx")).toMatch(/filter\(\(\[uid\]\) => open\("abo_kandidaat", uid\)\)\.slice\(0, 5\)/);
  });

  it("rekensom en abo-reeks weten van elkaar — anders vier mails over hetzelfde", () => {
    const a = lees("app/beheer/insight-actions.js");
    expect(a).toMatch(/zitInReeks\(admin, profile\.gym_id, lid\.email, "abo_reeks"\)/);
    expect(a).toMatch(/reeks === "abo_reeks"[\s\S]{0,200}insight_abo_voorstel/);
  });
});
