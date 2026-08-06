// Zoekt helpers die gebruikt worden zonder import of lokale definitie.
//
// Waarom dit bestaat: `sess()` stond in twee prijsregels van BookingClient zonder import. Dat is
// geen compilatiefout maar een ReferenceError die pas afgaat wanneer die tak van de UI rendert —
// hier: enkel voor leden mét tegoed. Build, tests en handmatig klikken misten hem allemaal, tot een
// lid met een vers abonnement niet meer kon boeken. Deze scan vangt dezelfde fout voortaan af.
//   node scripts/scan-missing-imports.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const HELPERS = [
  "sess", "euro", "eur", "fmtHour", "slotInstant", "brusselsDateStr", "slotRangeLabel",
  "isSettled", "sourceLabel", "track", "classifyClientError", "explainClass",
  "recordConsent", "hasConsent", "isNetworkError", "waitForNetwork", "readUtm",
];

const files = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (e === "node_modules" || e === ".next") continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(e) && !/\.test\./.test(e)) files.push(p);
  }
};
for (const r of ROOTS) { try { walk(r); } catch {} }

let gevonden = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  // Commentaar en strings weghalen zou over-engineering zijn; we zoeken een aanroep en checken
  // daarna of de naam ergens gedefinieerd of geïmporteerd is. Vals alarm is hier goedkoop.
  for (const h of HELPERS) {
    const gebruikt = new RegExp(`(^|[^\\w.$'"\`])${h}\\s*\\(`, "m").test(src);
    if (!gebruikt) continue;
    const bekend =
      new RegExp(`import[\\s\\S]{0,200}?\\b${h}\\b[\\s\\S]{0,200}?from`, "m").test(src) ||
      new RegExp(`(function|const|let|var)\\s+${h}\\b`).test(src) ||
      new RegExp(`\\b${h}\\s*[:=]\\s*(\\(|async|function)`).test(src);
    if (!bekend) { console.log(`⚠ ${f}  →  ${h}() gebruikt zonder import of definitie`); gevonden++; }
  }
}
console.log(gevonden ? `\n${gevonden} mogelijk probleem(en) — elk handmatig nakijken.` : "\n✓ Geen ontbrekende imports gevonden.");
