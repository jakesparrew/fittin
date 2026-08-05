import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { weekReportHtml } from "@/lib/email";

// Deze mail wordt onbewaakt door een cron opgebouwd: crasht de opbouw, dan merkt niemand het —
// er komt gewoon nooit een rapport. Daarom testen we hier vooral de randen: een lege week
// (nieuwe gym, vakantie) en een week waarin alles tegelijk misloopt.

const emptyReport = {
  range: { start: new Date("2026-07-27T00:00:00+02:00"), end: new Date("2026-08-03T00:00:00+02:00") },
  sessions: { now: 0, prev: 0, cancelled: 0 },
  revenue: { now: 0, prev: 0 },
  members: { now: 0, prev: 0 },
  unique: { now: 0, prev: 0 },
  byDay: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"].map((label) => ({ label, value: 0 })),
  busiestHours: [],
  quietDays: [],
  abo: { active: 0, mrr: 0, newAbos: 0, pastDue: [], ending: [] },
  candidates: [],
  coachDebt: [],
  toInvoice: [],
  openInvoiceCents: 0,
  openReports: 0,
  health: { mailsSent: 0, mailsFailed: 0, accessCronBad: false, activationCronBad: false },
};

const fullReport = {
  ...emptyReport,
  sessions: { now: 23, prev: 18, cancelled: 2 },
  revenue: { now: 31500, prev: 24000 },
  members: { now: 3, prev: 1 },
  unique: { now: 14, prev: 12 },
  byDay: [
    { label: "maandag", value: 62 }, { label: "dinsdag", value: 12 }, { label: "woensdag", value: 71 },
    { label: "donderdag", value: 38 }, { label: "vrijdag", value: 44 }, { label: "zaterdag", value: 9 },
    { label: "zondag", value: 0 },
  ],
  busiestHours: [
    { label: "07:00", value: 4, hour: 7 }, { label: "11:00", value: 6, hour: 11 },
    { label: "17:00", value: 5, hour: 17 }, { label: "19:00", value: 8, hour: 19 },
  ],
  quietDays: ["dinsdag", "zaterdag", "zondag"],
  abo: {
    active: 9, mrr: 10800, newAbos: 2,
    pastDue: ["Amine El Ouahabi"],
    ending: [{ name: "Lotte Peeters", until: "2026-08-28T00:00:00+02:00" }],
  },
  candidates: [{ name: "Tim Van Damme", sessions: 7 }, { name: "Sara Willems", sessions: 4 }],
  coachDebt: [{ name: "Thomas De Witte", sessions: -1.5, euros: 18 }],
  toInvoice: [{ name: "Jan Matthys", cents: 9600 }],
  openInvoiceCents: 14400,
  openReports: 2,
  health: { mailsSent: 61, mailsFailed: 0, accessCronBad: false, activationCronBad: false },
};

const brokenHealth = { ...fullReport, health: { mailsSent: 40, mailsFailed: 3, accessCronBad: true, activationCronBad: false } };

describe("weekReportHtml", () => {
  it("bouwt een lege week op zonder te crashen en zegt eerlijk dat er niets gebeurde", () => {
    const html = weekReportHtml({ name: "Ran", report: emptyReport });
    expect(html).toContain("geen enkele sessie");
    expect(html).toContain("Niets dringends");     // lege actielijst → geruststelling, geen lege kop
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });

  it("toont cijfers, vergelijking, bezetting en alle actiepunten", () => {
    const html = weekReportHtml({ name: "Ran", report: fullReport });
    expect(html).toContain("23");
    expect(html).toContain("€ 315,00");
    expect(html).toContain("t.o.v. vorige week");
    expect(html).toContain("Thomas De Witte");     // coach met openstaand tegoed
    expect(html).toContain("Amine El Ouahabi");    // mislukte abo-betaling
    expect(html).toContain("Lotte Peeters");       // opzegging
    expect(html).toContain("Tim Van Damme");       // abo-kandidaat
    // Nog niet gefactureerde coach-sessies: dit ontbrak in de eerste versie van het rapport,
    // waardoor € 156 maandenlang onzichtbaar opliep.
    expect(html).toContain("Jan Matthys");
    expect(html).toContain("€ 96,00");
    expect(html).toContain("meldingen");
    expect(html).toContain("dinsdag, zaterdag, zondag"); // rustige dagen → promotieruimte
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });

  it("waarschuwt zichtbaar als mails of crons falen", () => {
    const html = weekReportHtml({ name: "Ran", report: brokenHealth });
    expect(html).toContain("Let op");
    expect(html).toContain("3 mail(s) mislukt");
    expect(html).toContain("Deurcode-taak");
  });

  it("schrijft een preview weg met PREVIEW_DIR (handmatig nakijken)", () => {
    const dir = process.env.PREVIEW_DIR;
    if (!dir) return;
    writeFileSync(`${dir}/weekreport-vol.html`, weekReportHtml({ name: "Ran", report: fullReport }));
    writeFileSync(`${dir}/weekreport-leeg.html`, weekReportHtml({ name: "Ran", report: emptyReport }));
    expect(true).toBe(true);
  });
});
