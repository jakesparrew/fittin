import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Regressietest voor React #418 — hydratatie-mismatch door de klok.
//
// Wat er misgaat: een client-component wordt óók op de server gerenderd. Leest de render-functie
// daar de klok, dan rekent de server met zíjn moment en de browser een fractie later met het hare.
// Valt er een grens tussen (bv. "mag deze sessie nog verplaatst worden — tot 1 uur vooraf?"), dan
// zet de server een knop neer waar de browser een tekstje verwacht. React geeft #418 en de pagina
// loopt vast — niet één element, de hele pagina.
//
// Voorgeschiedenis in dit project: 46 keer gelogd. 45× op /account, 1× op /beheer/boekingen, en op
// 26-08-2026 om 07:39 op /coach/agenda, waar een coach zijn agenda niet meer kon openen. Die laatste
// zat op een sessie die om 08:39 begon: exact op de grens van één uur.
//
// Wat deze test bewaakt: een ja/nee-waarde die tijdens het renderen uit de klok komt. Dat is het
// patroon dat kapotgaat — een tijdstip formatteren is ongevaarlijk, een grens vergelijken niet.
const ROOT = path.resolve(import.meta.dirname, "..");
const MAPPEN = ["app", "components"];

// `const x = ... Date.now() ... < of >` — een boolean uit de klok.
const GEVAAR = /^\s*const\s+\w+\s*=\s*(?![^;]*\?\?)[^;]*\bDate\.now\(\)[^;]*[<>][^;]*;/;

// Nog niet omgezet, bewust en met reden. Beide zitten in het boekingsraster en verbergen een slot
// dat al voorbij is. De juiste oplossing is niet "na hydratatie beslissen" (dan flikkeren voorbije
// uren even als boekbaar op de pagina waar het geld binnenkomt) maar het servermoment als prop
// meegeven, zodat beide kanten met hetzelfde getal rekenen. Dat is een aparte ingreep op de
// boekflow. Empirisch is het risico klein: /boeken heeft in de hele historiek nul #418-fouten.
const NOG_TE_DOEN = new Set([
  "components/booking/BookingClient.jsx",
  "components/coach/CoachScheduler.jsx",
]);

const jsxBestanden = (dir, acc = []) => {
  for (const naam of fs.readdirSync(dir)) {
    if (naam === "node_modules" || naam === ".next") continue;
    const p = path.join(dir, naam);
    const st = fs.statSync(p);
    if (st.isDirectory()) jsxBestanden(p, acc);
    else if (/\.(jsx|js)$/.test(naam)) acc.push(p);
  }
  return acc;
};

const clientBestanden = () =>
  MAPPEN
    .flatMap((m) => jsxBestanden(path.join(ROOT, m)))
    .filter((p) => /^["']use client["']/m.test(fs.readFileSync(p, "utf8")));

describe("hydratatie: geen ja/nee-waarde uit de klok tijdens het renderen", () => {
  it("vindt client-componenten om te controleren", () => {
    expect(clientBestanden().length).toBeGreaterThan(10);
  });

  it("geen NIEUWE client-component leidt een grens af uit Date.now() in de render", () => {
    const fouten = [];
    for (const p of clientBestanden()) {
      const rel = path.relative(ROOT, p).replace(/\\/g, "/");
      if (NOG_TE_DOEN.has(rel)) continue;
      fs.readFileSync(p, "utf8").split("\n").forEach((r, i) => {
        if (r.trim().startsWith("//")) return;                 // commentaar telt niet
        if (GEVAAR.test(r)) fouten.push(`${rel}:${i + 1}  ${r.trim().slice(0, 90)}`);
      });
    }
    expect(fouten.join("\n") || "geen").toBe("geen");
  });

  it("CoachSessionActions bepaalt zijn tijdsgrenzen pas ná hydratatie", () => {
    const bron = fs.readFileSync(path.join(ROOT, "components/coach/CoachSessionActions.jsx"), "utf8");
    expect(bron).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*setNu\(Date\.now\(\)\)/);
    expect(bron).toMatch(/!gemount \|\|/);
  });

  it("RescheduleBooking bepaalt zijn 6-uursgrens pas ná hydratatie", () => {
    const bron = fs.readFileSync(path.join(ROOT, "components/booking/RescheduleBooking.jsx"), "utf8");
    expect(bron).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*setNu\(Date\.now\(\)\)/);
    expect(bron).toMatch(/const locked = nu !== null &&/);
  });

  it("de openstaande gevallen staan nog waar ze staan (anders mag de lijst korter)", () => {
    // Elk vermeld bestand moet nog bestaan én nog een klokvergelijking in de render hebben. Zet
    // iemand er een om naar het useEffect-patroon, dan verdwijnt die en faalt deze test — een
    // herinnering om de naam uit de lijst te halen zodat de echte bewaker hem weer dekt.
    for (const rel of NOG_TE_DOEN) {
      const full = path.join(ROOT, rel);
      expect(fs.existsSync(full), `${rel} bestaat niet meer — haal hem uit NOG_TE_DOEN`).toBe(true);
      const raak = fs.readFileSync(full, "utf8").split("\n").some((r) => {
        if (r.trim().startsWith("//")) return false;
        return /\bDate\.now\(\)/.test(r) && /[<>]/.test(r);   // een klokvergelijking, ergens op de regel
      });
      expect(raak, `${rel} lijkt opgeschoond — haal hem uit NOG_TE_DOEN`).toBe(true);
    }
  });
});
