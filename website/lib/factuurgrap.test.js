import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// De grap in het beheer mag maar op één plek hangen.
//
// Waarom dit een test verdient en geen opmerking: de melding beweert dat de site over 72 uur offline
// gaat. Op /beheer is dat onschuldig — daar komt alleen de eigenaar, en die weet dat hij een grap
// verwacht. Verhuist dit component ooit naar app/layout.jsx of naar een coachpagina, dan krijgen
// leden en coaches een valse storingsmelding over hun eigen boekingen te zien. Dat is geen grap
// meer, dat is een supportprobleem. Deze test maakt die verhuizing onmogelijk zonder ze te zien.
const ROOT = path.resolve(import.meta.dirname, "..");
const COMPONENT = "components/admin/FactuurHerinneringGrap.jsx";
const ENIGE_PLEK = "app/beheer/layout.jsx";

const bestanden = (dir, acc = []) => {
  for (const naam of fs.readdirSync(dir)) {
    if (naam === "node_modules" || naam === ".next") continue;
    const p = path.join(dir, naam);
    if (fs.statSync(p).isDirectory()) bestanden(p, acc);
    else if (/\.(jsx|js)$/.test(naam)) acc.push(p);
  }
  return acc;
};

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

describe("factuurgrap: hangt alleen in het beheer", () => {
  const bron = fs.readFileSync(path.join(ROOT, COMPONENT), "utf8");

  it("wordt nergens anders geïmporteerd dan in de beheer-layout", () => {
    const plekken = ["app", "components"]
      .flatMap((m) => bestanden(path.join(ROOT, m)))
      .filter((p) => rel(p) !== COMPONENT)
      .filter((p) => /FactuurHerinneringGrap/.test(fs.readFileSync(p, "utf8")))
      .map(rel);
    expect(plekken).toEqual([ENIGE_PLEK]);
  });

  it("de beheer-layout stuurt elke andere rol weg vóór ze rendert", () => {
    // Zonder deze regel is de zin hierboven niet waar. Ze staat er al sinds het beheer bestaat;
    // deze test koppelt de grap eraan vast, zodat ze niet stil kan sneuvelen.
    const layout = fs.readFileSync(path.join(ROOT, ENIGE_PLEK), "utf8");
    expect(layout).toMatch(/role\s*!==\s*["']beheerder["'][\s\S]{0,80}redirect/);
  });

  it("leest de klok pas ná hydratatie", () => {
    // Zelfde patroon als CoachSessionActions en RescheduleBooking. Een afteller is precies het soort
    // component dat React-fout #418 opnieuw zou veroorzaken.
    expect(bron).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*setNu\(Date\.now\(\)\)/);
    expect(bron).toMatch(/const rest = nu === null \? null :/);
  });

  it("is met één regel uit te zetten", () => {
    // De eigenaar moet dit kunnen laten stoppen zonder dat er iemand code moet uitpluizen.
    expect(bron).toMatch(/^const GRAP_AAN = (true|false);$/m);
    expect(bron).toMatch(/const stil = !GRAP_AAN \|\|/);
    expect(bron).toMatch(/if \(stil\) return null;/);
  });

  it("blijft weg van elk scherm met echte klanten of echt geld", () => {
    // Een verzonnen betalingsalarm naast een echte factuur of een echte terugbetaling is geen grap
    // meer. /beheer/factuur vertrekt naar een klant, /beheer/financien toont echte betalingen.
    expect(bron).toMatch(/const NIET_HIER = \[[^\]]*"\/beheer\/factuur"[^\]]*\]/s);
    expect(bron).toMatch(/const NIET_HIER = \[[^\]]*"\/beheer\/financien"[^\]]*\]/s);
    // En de sleutel wordt daar niet weggeschreven, anders is de grap stil opgebruikt.
    expect(bron).toMatch(/if \(stil\) return;/);
  });

  it("raakt geen databank, geen betaling en geen e-mail", () => {
    // Het is een tekstje op het scherm. Zodra hier iets ingevoerd wordt dat schrijft, verstuurt of
    // afrekent, is het geen grap meer maar een ingreep in een draaiend bedrijf.
    for (const verboden of ["supabase", "stripe", "fetch(", "sendBeacon", "createClient", "/api/"]) {
      expect(bron.includes(verboden), `component mag ${verboden} niet gebruiken`).toBe(false);
    }
  });

  it("laat localStorage nooit een fout gooien", () => {
    // ErrorLogger stuurt een alarmmail bij een client-fout. Een grap mag daar nooit de bron van zijn;
    // in privémodus gooit localStorage.
    expect(bron).toMatch(/try \{ return window\.localStorage\.getItem/);
    expect(bron).toMatch(/try \{ window\.localStorage\.setItem[\s\S]{0,40}catch/);
  });

  it("verdwijnt bij het printen", () => {
    // /beheer/factuur is een printpagina die naar echte klanten vertrekt. Een verzonnen
    // aanmaningsbalk op een echte factuur is geen grap meer. globals.css verbergt .print:hidden.
    const balk = /border-b border-red-200[^"]*print:hidden/;
    const modaal = /fixed inset-0 z-\[90\][^"]*print:hidden/;
    expect(bron).toMatch(balk);
    expect(bron).toMatch(modaal);
  });

  it("blijft onder de toasts, zodat een echte melding altijd bovenaan komt", () => {
    const toast = fs.readFileSync(path.join(ROOT, "components/ui/ToastHost.jsx"), "utf8");
    const nummer = (s) => Number(/z-\[(\d+)\]/.exec(s)?.[1]);
    expect(nummer(bron)).toBeLessThan(nummer(toast));
  });
});
