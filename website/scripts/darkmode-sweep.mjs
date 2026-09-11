// Eenmalige codemod: betekenis scheiden van kleur, zodat dark mode een tokenwissel wordt.
//
// HET PROBLEEM DAT DIT OPLOST. Elke kleurklasse in deze app compileert naar een `var()` — ook
// `bg-white`, want Tailwind v4 definieert `--color-white`. Een donker thema is dus in principe het
// herdefiniëren van een handvol variabelen, niet het aanpassen van tweehonderd bestanden.
//
// Op twee plekken botst dat, en die twee zijn de hele reden dat dit script bestaat:
//
//   `white`  is tegelijk een VLAK (bg-white, 518×, moet meeflippen naar donker) en een TEKSTKLEUR
//            (text-white, 240×, moet wit BLIJVEN — het staat op groen en op indigo).
//   `brand`  is tegelijk de HOOFDTEKSTKLEUR (text-brand, 2326×, moet licht worden) en een DONKER
//            VLAK (bg-brand, 192×, moet donker blijven).
//
// Eén variabele kan niet aan twee tegengestelde eisen voldoen. Daarom krijgen de twee rollen die
// moeten flippen een eigen naam: `surface` voor het kaartvlak en `ink` voor de tekst. Wat niet
// flipt, houdt zijn oude naam. Na deze sweep is dark mode een kwestie van acht tokens.
//
// WAT DIT SCRIPT NIET AANRAAKT: text-white, bg-brand, border-brand, shadow-brand, de gradients, en
// alles in lib/email.js (mails hebben eigen inline kleuren en mailclients doen zelf al aan
// omkeren — buiten scope).
//
//   node scripts/darkmode-sweep.mjs        → toont wat het zou doen
//   node scripts/darkmode-sweep.mjs --doe  → past het toe

import fs from "node:fs";
import path from "node:path";

const doe = process.argv.includes("--doe");
const WORTELS = ["app", "components"];
const EXT = new Set([".jsx", ".js"]);
// Deze bestanden gaan over MAILS of over het thema zelf; daar betekent `bg-white` iets anders.
const OVERSLAAN = [/lib[\\/]email/, /email-visuals/, /globals\.css/];

// De vervangingen. Prefixen (hover:, sm:, group-hover:) en opacity-suffixen (/40) blijven staan
// doordat we alleen het middenstuk vervangen.
const REGELS = [
  { van: /\btext-brand\b(?!deep)/g, naar: "text-ink", waarom: "hoofdtekst moet licht worden in donker" },
  { van: /\bbg-white\b/g, naar: "bg-surface", waarom: "kaartvlak moet donker worden" },
];

function* bestanden(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") yield* bestanden(p); continue; }
    if (EXT.has(path.extname(e.name))) yield p;
  }
}

let raak = 0, totaal = 0;
const perRegel = new Map(REGELS.map((r) => [r.naar, 0]));

for (const p of WORTELS.flatMap((w) => [...bestanden(w)])) {
  if (OVERSLAAN.some((r) => r.test(p))) continue;
  const oud = fs.readFileSync(p, "utf8");
  let nieuw = oud;
  for (const r of REGELS) {
    const n = (nieuw.match(r.van) || []).length;
    if (!n) continue;
    perRegel.set(r.naar, perRegel.get(r.naar) + n);
    totaal += n;
    nieuw = nieuw.replace(r.van, r.naar);
  }
  if (nieuw === oud) continue;
  raak++;
  if (doe) fs.writeFileSync(p, nieuw);
}

for (const [naar, n] of perRegel) console.log(`  → ${naar}: ${n} keer`);
console.log(`\n${totaal} vervangingen in ${raak} bestanden.`);
if (!doe) console.log("Proefdraai. Voeg --doe toe om het echt te schrijven.");
