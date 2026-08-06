// Eenmalige, deterministische herordening van BookingClient.jsx: het blok "Met hoeveel kom je? +
// Hoe lang?" (nu stap 3, ONDER het rooster) verhuist naar BOVEN het rooster.
//
// Waarom via een script en niet met de hand: het gaat om ~90 aaneengesloten regels JSX die exact
// moeten blijven wat ze zijn. Knippen op regelnummers is controleerbaar; met de hand herschrijven
// nodigt uit tot stille verschillen.
import { readFileSync, writeFileSync } from "node:fs";

const P = "components/booking/BookingClient.jsx";
const lines = readFileSync(P, "utf8").split("\n");

// 1-indexed grenzen (uit grep geverifieerd):
//   461 = "            {/* Persons */}"
//   462 = "            {isFit60 && ("
//   550 = "            )}"   ← einde van dat blok
const from = 461, to = 550;
const blok = lines.slice(from - 1, to);
if (!blok[1].includes("{isFit60 && (") || !blok[2].includes("Met hoeveel kom je?")) {
  console.error("Blokgrens klopt niet — gestopt zonder te schrijven.");
  console.error(blok.slice(0, 4).join("\n"));
  process.exit(1);
}
if (blok[blok.length - 1].trim() !== ")}") {
  console.error("Einde van het blok klopt niet: " + JSON.stringify(blok[blok.length - 1]));
  process.exit(1);
}

// Blok eruit
const rest = [...lines.slice(0, from - 1), ...lines.slice(to)];

// Invoegpunt: net vóór de regel met de roosterkaart.
const idx = rest.findIndex((l) => l.includes('<Card step="2" title="Kies je moment">'));
if (idx < 0) { console.error("Roosterkaart niet gevonden."); process.exit(1); }
// De regel erboven is het commentaar "{/* Schedule grid */}" — daar willen we vóór staan.
const insertAt = rest[idx - 1].includes("Schedule grid") ? idx - 1 : idx;

const out = [...rest.slice(0, insertAt), ...blok, "", ...rest.slice(insertAt)];
writeFileSync(P, out.join("\n"));
console.log(`Verplaatst: ${blok.length} regels van positie ${from} naar ${insertAt + 1}.`);
