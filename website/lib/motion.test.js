import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Bewaakt het bewegingssysteem uit app/globals.css.
//
// Waarom dit een test verdient: beweging is de enige laag in deze app die je NIET ziet falen. Een
// stukke query geeft een foutmelding, een stukke animatie geeft alleen een pagina die net iets
// goedkoper aanvoelt — of, erger, een gebruiker die beweging heeft uitgezet en toch alles ziet
// bewegen. Dat laatste stond hier tot 2026-09-07 twee jaar lang aan.
//
// De regels hieronder leggen bewuste keuzes vast, geen smaak. Elke test noemt de val die hij dicht.
const ROOT = path.resolve(import.meta.dirname, "..");
const CSS = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

const MAPPEN = ["app", "components"];
const jsxBestanden = (dir, acc = []) => {
  for (const naam of fs.readdirSync(dir)) {
    if (naam === "node_modules" || naam === ".next") continue;
    const p = path.join(dir, naam);
    if (fs.statSync(p).isDirectory()) jsxBestanden(p, acc);
    else if (/\.(jsx|js)$/.test(naam)) acc.push(p);
  }
  return acc;
};
const alleBron = () =>
  MAPPEN.flatMap((m) => jsxBestanden(path.join(ROOT, m))).map((p) => ({
    rel: path.relative(ROOT, p).replace(/\\/g, "/"),
    tekst: fs.readFileSync(p, "utf8"),
  }));

describe("bewegingstokens", () => {
  it("de drie curves staan in @theme", () => {
    // Eén plek voor de timing. Zonder tokens gokt elke nieuwe knop opnieuw, en dat is precies hoe
    // deze codebase aan 529 losse bewegingsklassen kwam.
    for (const token of ["--ease-uit", "--ease-in-uit", "--ease-veer"]) {
      expect(CSS, `${token} ontbreekt in @theme`).toMatch(new RegExp(`${token}:\\s*cubic-bezier`));
    }
  });

  it("timing staat NERGENS als losse waarde buiten @theme", () => {
    // De val: iemand plakt een cubic-bezier rechtstreeks in een regel, en vanaf dat moment bestaan
    // er twee "huiscurves" die langzaam uit elkaar lopen. .reveal had er zo al twee kopieën van.
    const themaEinde = CSS.indexOf("}", CSS.indexOf("@theme"));
    const buiten = CSS.slice(themaEinde);
    const losse = buiten.match(/cubic-bezier\([^)]*\)/g) || [];
    expect(losse.join(", ") || "geen").toBe("geen");
  });

  it("elke kale transition-klasse erft de huiscurve", () => {
    // 497 van de 529 bewegingsklassen zijn de kale `transition`. Deze ene regel stuurt ze allemaal;
    // valt ze weg, dan vallen ze terug op de symmetrische Tailwind-default en voelt de hele app
    // trager, zonder dat er ook maar één bestand verandert.
    expect(CSS).toMatch(/--default-transition-timing-function:\s*var\(--ease-uit\)/);
    expect(CSS).toMatch(/--default-transition-duration:\s*\d+ms/);
  });
});

describe("minder beweging (prefers-reduced-motion)", () => {
  const blok = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));

  it("het blok bestaat en geldt voor ALLES, niet voor een handvol klassen", () => {
    // De val: tot 2026-09-07 somde dit blok vijf decoratieve klassen op. Alle ~500 transitions, de
    // spinner en de skeletten vielen erbuiten. Een opsomming veroudert; een sterretje niet.
    expect(CSS).toContain("@media (prefers-reduced-motion: reduce)");
    expect(blok).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{/);
    expect(blok).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(blok).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });

  it("houdt .reveal zichtbaar", () => {
    // .reveal begint op opacity:0 en wordt pas zichtbaar door een IntersectionObserver. Een duur van
    // nul maakt hem niet zichtbaar — zonder deze regel blijft inhoud gewoon weg.
    expect(blok).toMatch(/\.reveal\s*\{[^}]*opacity:\s*1\s*!important/);
  });

  it("zet de lopende animaties op hun BEGINstand, niet op hun eindstand", () => {
    // Een duur van nul springt naar 100%. Voor de marquee is dat translateX(-50%): de helft van de
    // inhoud staat dan buiten beeld. Deze moeten dus echt `animation: none` krijgen.
    for (const klasse of [".marquee-track", ".animate-floaty", ".brand-mesh"]) {
      expect(blok, `${klasse} mist een expliciete animation:none`).toMatch(
        new RegExp(`${klasse.replace(".", "\\.")}[^{]*\\{[^}]*animation:\\s*none`)
      );
    }
  });

  it("laat de spinner en de skeletten wél doorlopen", () => {
    // Een bevroren spinner leest als een vastgelopen app. Deze twee zijn statusinformatie, geen
    // decor: ze worden trager, niet stil.
    expect(blok).toMatch(/\.animate-spin\s*\{[^}]*animation-iteration-count:\s*infinite/);
    expect(blok).toMatch(/\.animate-pulse\s*\{[^}]*animation-iteration-count:\s*infinite/);
  });
});

describe("bewegingsvocabulaire", () => {
  it("elke anim-klasse die in de app gebruikt wordt, bestaat ook echt", () => {
    // De val: een klasse die niet bestaat doet niets en geeft geen fout. Een typfout in `anim-in`
    // is onzichtbaar tot iemand toevallig kijkt. Dit koppelt gebruik aan definitie.
    const gebruikt = new Set();
    for (const { tekst } of alleBron()) {
      for (const m of tekst.matchAll(/\banim-[a-z]+\b/g)) gebruikt.add(m[0]);
    }
    expect(gebruikt.size, "er wordt nergens een anim-klasse gebruikt").toBeGreaterThan(2);
    const ontbreekt = [...gebruikt].filter((k) => !new RegExp(`\\.${k}\\s*\\{`).test(CSS));
    expect(ontbreekt.join(", ") || "geen").toBe("geen");
  });

  it("geen dode keyframes", () => {
    // Dood CSS is een AX-probleem: een volgende agent kopieert wat hij vindt. `fade-up` stond hier
    // ongebruikt en is daarom weggehaald. Elke keyframe moet ergens in dezelfde stylesheet
    // aangeroepen worden.
    const namen = [...CSS.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(namen.length).toBeGreaterThan(3);
    const dood = namen.filter((n) => {
      const gebruik = CSS.match(new RegExp(`animation(-name)?:\\s*[^;]*\\b${n}\\b`, "g")) || [];
      return gebruik.length === 0;
    });
    expect(dood.join(", ") || "geen").toBe("geen");
  });

  it("elk laadscherm beweegt ook echt", () => {
    // Een loading.jsx die een stil vlak rendert, is geen laadscherm maar een lege pagina. De puls
    // is het enige signaal dat er iets onderweg is.
    const zonderPuls = alleBron()
      .filter(({ rel }) => /\/loading\.jsx$/.test(rel))
      .filter(({ tekst }) => !/animate-pulse/.test(tekst) && !/PageSkeleton|Skeletons/.test(tekst))
      .map(({ rel }) => rel);
    expect(zonderPuls.join(", ") || "geen").toBe("geen");
  });

  it("elke gebruikte skeletvariant bestaat", () => {
    // De val: `variant="rasterr"` rendert zwijgend alleen de titelbalken. Geen fout, geen
    // waarschuwing, alleen een skelet dat niets belooft.
    const skelet = fs.readFileSync(path.join(ROOT, "components/ui/PageSkeleton.jsx"), "utf8");
    const bestaat = new Set([...skelet.matchAll(/variant === "([a-z]+)"/g)].map((m) => m[1]));
    expect(bestaat.size).toBeGreaterThan(3);
    const gebruikt = new Set();
    for (const { rel, tekst } of alleBron()) {
      if (!/\/loading\.jsx$/.test(rel)) continue;
      for (const m of tekst.matchAll(/variant="([a-z]+)"/g)) gebruikt.add(m[1]);
    }
    const onbekend = [...gebruikt].filter((v) => !bestaat.has(v));
    expect(onbekend.join(", ") || "geen").toBe("geen");
  });

  it("overlays bewegen bij het openen", () => {
    // Zeventien dialogen verschenen in één frame. Deze test houdt vast dat een nieuwe overlay niet
    // stilletjes weer zonder overgang wordt toegevoegd.
    const zonder = alleBron()
      .filter(({ tekst }) => /className="fixed inset-0/.test(tekst))
      .map(({ rel }) => rel);
    expect(zonder.join(", ") || "geen").toBe("geen");
  });
});
