import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Regressietest voor de mobiele uitloper van 2026-08-16.
//
// Wat er misging: `grid-cols-[2rem_1fr_1fr_2rem]` rond twee invoervelden. Een `1fr`-kolom is in
// CSS `minmax(auto, 1fr)` — die `auto` betekent dat de kolom NIET kleiner mag worden dan de
// intrinsieke breedte van haar inhoud, en een <input> claimt van zichzelf zo'n 180px. Twee van die
// kolommen passen niet op een telefoon, dus liep het raster rechts uit beeld en werd de laatste
// kolom (de verwijderknop) onbereikbaar. De gebruiker meldde dat als "ik kan sets toevoegen maar
// niet weg doen" — de knop stond er, buiten het scherm.
//
// Deze test bewaakt dat een grid met een vaste kolomdefinitie rond invoervelden altijd
// minmax(0,…) gebruikt. Zonder deze grendel sluipt `1fr` er zo weer in.
const ROOT = path.resolve(import.meta.dirname, "..");

const jsxBestanden = (dir, acc = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (!["node_modules", ".next", ".git"].includes(f.name)) jsxBestanden(p, acc); }
    else if (f.name.endsWith(".jsx")) acc.push(p);
  }
  return acc;
};

describe("mobiele uitloper", () => {
  const bestanden = [...jsxBestanden(path.join(ROOT, "components")), ...jsxBestanden(path.join(ROOT, "app"))];

  it("gebruikt geen kale 1fr-kolom in een grid dat invoervelden bevat", () => {
    const overtreders = [];
    for (const f of bestanden) {
      const src = fs.readFileSync(f, "utf8");
      // Alleen relevant wanneer er ook echt invoervelden in het bestand staan: bij tekst is een
      // 1fr-kolom prima, bij een <input> is ze een uitloper in wording.
      if (!/<input\b/.test(src)) continue;
      for (const m of src.matchAll(/grid-cols-\[([^\]]+)\]/g)) {
        const def = m[1];
        if (/(^|_)1fr/.test(def) && !def.includes("minmax")) {
          overtreders.push(`${path.relative(ROOT, f)} → grid-cols-[${def}]`);
        }
      }
    }
    expect(overtreders).toEqual([]);
  });

  it("houdt het vangnet tegen zijwaarts scrollen in globals.css", () => {
    const css = fs.readFileSync(path.join(ROOT, "app", "globals.css"), "utf8");
    expect(css).toMatch(/body\s*\{[^}]*overflow-x:\s*clip/);
  });
});
