// Tweede pas van de dark-mode-sweep: tekst die op een NIET-meeflippend vlak staat, terugzetten.
//
// WAT ER MIS GING IN PAS 1. `text-brand` → `text-ink` was juist voor tekst op een kaart, want die
// kaart flipt mee. Maar niet elk vlak flipt: `bg-accent` is het merkgroen en blijft groen, en de
// vaste palettinten (`bg-amber-50`, `bg-red-50`) blijven licht — dat zijn statuskaarten en die
// horen licht te blijven, ook 's nachts. Op zulke vlakken werd de tekst bijna-wit: gemeten 1,5:1
// voor het inbox-telletje op groen (was 8,88:1) en 1,15:1 voor een amberkaart.
//
// De regel die daaruit volgt en die blijft gelden: `ink` is tekst op een vlak dat meeflipt,
// `brand` is tekst op een vlak dat dat niet doet. `brand` is sinds pas 1 een constante — het
// merkindigo — en dus precies de juiste kleur voor "donkere tekst op iets lichts".
//
// WAT DIT SCRIPT MET RUST LAAT, en dat is het halve werk:
//   • doorschijnende tinten (`bg-accent/10`, `bg-amber-50/50`) — die liggen ÓP de kaart en flippen
//     dus effectief mee; daar hoort de tekst juist licht te worden;
//   • donkere vlakken (`bg-brand`, `bg-red-600`) — daar staat `text-white` en die raakten we nooit;
//   • ouder/kind-combinaties over meerdere elementen. Die vind je niet met een regex; ze zijn
//     gemeten in de browser en met de hand rechtgezet.
//
//   node scripts/darkmode-sweep-2.mjs        → toont wat het zou doen
//   node scripts/darkmode-sweep-2.mjs --doe  → past het toe

import fs from "node:fs";
import path from "node:path";

const doe = process.argv.includes("--doe");
const EXT = new Set([".jsx", ".js"]);
const OVERSLAAN = [/lib[\\/]email/, /email-visuals/];

// Een vlak dat NIET meeflipt: het merkgroen, of een lichte palettint — allebei ZONDER
// opacity-modifier, want met modifier ligt het op de kaart eronder en flipt het effectief wel mee.
const VAST_LICHT = /\bbg-(accent|amber|red|green|blue|yellow|orange|emerald|sky|rose|lime|teal|indigo|violet|purple|pink|cyan|slate|gray|zinc|neutral|stone)(-(50|100|200))?(?![-\d/])/;

function* bestanden(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") yield* bestanden(p); continue; }
    if (EXT.has(path.extname(e.name))) yield p;
  }
}

let raak = 0, totaal = 0;
const voorbeelden = [];

for (const p of ["app", "components"].flatMap((w) => [...bestanden(w)])) {
  if (OVERSLAAN.some((r) => r.test(p))) continue;
  const oud = fs.readFileSync(p, "utf8");
  // Per klassenstring: alleen als daar een vast licht vlak in staat, draaien we de tekst terug.
  const nieuw = oud.replace(/"([^"\n]*)"|`([^`]*)`/g, (heel, dq, bt) => {
    const t = dq ?? bt;
    if (t === undefined || !VAST_LICHT.test(t)) return heel;
    const gedraaid = t.replace(/\btext-ink\b(?!-soft)/g, "text-brand");
    if (gedraaid === t) return heel;
    totaal += (t.match(/\btext-ink\b(?!-soft)/g) || []).length;
    if (voorbeelden.length < 5) voorbeelden.push(`${path.relative(".", p)}\n      ${gedraaid.trim().slice(0, 100)}`);
    return dq !== undefined ? `"${gedraaid}"` : `\`${gedraaid}\``;
  });
  if (nieuw === oud) continue;
  raak++;
  if (doe) fs.writeFileSync(p, nieuw);
}

console.log(`${totaal} keer text-ink → text-brand, in ${raak} bestanden.\n`);
for (const v of voorbeelden) console.log(`  ${v}`);
if (!doe) console.log("\nProefdraai. Voeg --doe toe om het echt te schrijven.");
