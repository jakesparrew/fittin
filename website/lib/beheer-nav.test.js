import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NAV, itemVoor, tabVoor } from "./beheer-nav.js";

const ROOT = path.resolve(__dirname, "..");
const alleLinks = NAV.flatMap((g) => g.items.flatMap((it) => (it.tabs || [[it.href]]).map(([h]) => h)));

describe("het beheermenu", () => {
  it("elke link in het menu bestaat als pagina", () => {
    const ontbreekt = alleLinks.filter((h) => !fs.existsSync(path.join(ROOT, "app", ...h.split("/").filter(Boolean), "page.jsx")));
    expect(ontbreekt).toEqual([]);
  });

  it("elke beheerpagina van het eerste niveau is bereikbaar via het menu (zijbalk of tab)", () => {
    // Uitzonderingen: pagina's die je enkel vanuit een andere pagina opent.
    const NIET_IN_MENU = new Set(["factuur"]);
    const mappen = fs.readdirSync(path.join(ROOT, "app/beheer"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, "app/beheer", e.name, "page.jsx")) && !NIET_IN_MENU.has(e.name))
      .map((e) => `/beheer/${e.name}`);
    expect(mappen.filter((m) => !alleLinks.includes(m))).toEqual([]);
  });

  it("kiest het juiste item en de juiste tab, ook op subpagina's", () => {
    expect(itemVoor("/beheer").label).toBe("Dashboard");
    expect(itemVoor("/beheer/leden/123").label).toBe("Leden");
    const m = itemVoor("/beheer/netheid");
    expect(m.label).toBe("Meldingen & netheid");
    expect(tabVoor(m, "/beheer/netheid").label).toBe("Netheid & ervaring");
    expect(itemVoor("/beheer/activatie/abc").label).toBe("Mails & campagnes");
    expect(itemVoor("/beheer/punten").label).toBe("Punten & community");
  });

  it("de zijbalk blijft kort", () => {
    expect(NAV.flatMap((g) => g.items).length).toBeLessThanOrEqual(15);
  });
});
