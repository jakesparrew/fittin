import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Het donkere thema, gemeten in plaats van bekeken.
//
// Waarom een test en geen screenshot: contrast is een getal, en de twee tokens die hier zakken
// zakken om een reden die je op een screenshot niet ziet. `accentdark` is ooit juist DONKERDER
// gemaakt om op wit AA te halen (5,21:1) — precies daarom faalt hij op donker (3,54:1). Wie het
// donkere palet ooit bijstelt, hoort dat te zien voordat het live gaat.

const ROOT = path.resolve(import.meta.dirname, "..");
const cssRuw = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
// Commentaar eruit vóór we iets toetsen. Dit bestand staat vol uitleg waarin constructies letterlijk
// genoemd worden ("gebruik nooit @theme inline"), en een test die daarop aanslaat, toetst het proza.
const css = cssRuw.replace(/\/\*[\s\S]*?\*\//g, "");

/** Relatieve luminantie volgens WCAG 2.1. */
function lum(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [la, lb] = [lum(a), lum(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Leest een waarde uit het donkere palet. Dat staat sinds de herstructurering ÉÉN keer, als
 * `--dm-*` op :root; de twee schakelaars (systeem vraagt donker / lid koos donker) mappen ze alleen
 * maar. Deze test leest dus de bron, en een van de twee blokken vergeten is een aparte test.
 */
function donker(naam) {
  const m = new RegExp(`--dm-${naam}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`donkere waarde niet gevonden: --dm-${naam}`);
  return m[1];
}

/** Leest een token uit het LICHTE thema (het @theme-blok). */
function licht(naam) {
  const blok = css.slice(css.indexOf("@theme"), css.indexOf("\n}", css.indexOf("@theme")));
  const m = new RegExp(`--color-${naam}:\\s*(#[0-9a-fA-F]{6})`).exec(blok);
  if (!m) throw new Error(`lichte waarde niet gevonden: --color-${naam}`);
  return m[1];
}

const AA = 4.5;
const AA_GROOT = 3;   // vanaf 18pt of 14pt vet

describe("het donkere thema haalt WCAG AA", () => {
  const paper = donker("paper");
  const surface = donker("surface");
  const ink = donker("ink");
  const inkSoft = donker("ink-soft");
  const lav = donker("lav");
  const accentdark = donker("accentdark");
  const brand = donker("brand");

  it("hoofdtekst op de pagina en op een kaart", () => {
    expect(contrast(ink, paper)).toBeGreaterThanOrEqual(AA);
    expect(contrast(ink, surface)).toBeGreaterThanOrEqual(AA);
  });

  it("gedempte tekst haalt het ook — dit is de token die naïef omkeren zou breken", () => {
    // #5a5479 (de lichte variant) haalt op #14121f maar 2,62:1.
    expect(contrast(inkSoft, surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(lav, surface)).toBeGreaterThanOrEqual(AA_GROOT);
  });

  it("groene tekst haalt het — accentdark is voor WIT gedarkend en zakt op donker naar 3,54:1", () => {
    expect(contrast(accentdark, surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(accentdark, paper)).toBeGreaterThanOrEqual(AA);
  });

  it("de donkere zijbalk blijft leesbaar — dit brak toen `lav` mee ging flippen", () => {
    // De beheerzijbalk is `bg-brand` met `text-lav`. In het lichte thema is dat 7,31:1. Toen het
    // donkere palet `brand` lichter maakte EN `lav` donkerder, zakte dat naar 4,05:1 — net onder de
    // grens, over 48 elementen tegelijk, en onzichtbaar voor elke test die alleen naar tokens kijkt.
    // Sommige tokens hoeven simpelweg niet te flippen.
    expect(contrast(lav, brand)).toBeGreaterThanOrEqual(AA);
  });

  it("wit op het merkindigo blijft leesbaar", () => {
    expect(contrast("#ffffff", brand)).toBeGreaterThanOrEqual(AA);
  });

  it("de groene knop houdt zijn merkkleur en zijn contrast", () => {
    // bg-accent text-ink: accent flipt NIET mee, want dat is het merk. In donker staat er donkere
    // tekst op groen, net als in licht.
    expect(contrast("#22194f", "#5fda6b")).toBeGreaterThanOrEqual(AA);
  });

  it("een kaart is te onderscheiden van de pagina", () => {
    // Niet over leesbaarheid maar over diepte: vallen surface en paper samen, dan verdwijnen alle
    // kaartranden en is het scherm één vlakte.
    expect(contrast(surface, paper)).toBeGreaterThan(1.05);
  });
});

describe("statuskaarten draaien mee", () => {
  // Een amberkaart die licht blijft terwijl de tekst erop meeflipt, is onleesbaar — gemeten 1,15:1
  // toen dat gebeurde. Er zijn maar twee families in gebruik (amber en rood), dus draaien die mee.
  const surface = donker("surface");

  it("de amberkaart is donker en alles erop is leesbaar", () => {
    const vlak = donker("amber-50");
    expect(contrast(donker("ink"), vlak)).toBeGreaterThanOrEqual(AA);
    for (const t of ["amber-600", "amber-700", "amber-800", "amber-900"]) {
      expect(contrast(donker(t), vlak)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("de roodkaart ook", () => {
    const vlak = donker("red-50");
    expect(contrast(donker("ink"), vlak)).toBeGreaterThanOrEqual(AA);
    for (const t of ["red-600", "red-700"]) {
      expect(contrast(donker(t), vlak)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("dezelfde tekstkleuren werken ook op een GEWONE kaart", () => {
    // text-red-600 staat niet alleen in roodkaarten maar ook als foutregel op een gewone kaart.
    for (const t of ["amber-600", "amber-700", "red-600", "red-700"]) {
      expect(contrast(donker(t), surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("elke statuskleur die de app gebruikt, heeft een donkere tegenhanger", () => {
    // Vergeet er één, dan is dat precies de kaart die 's nachts onleesbaar wordt.
    for (const k of ["amber-50", "amber-100", "amber-600", "amber-700", "amber-800", "red-50", "red-100", "red-600", "red-700"]) {
      expect(() => donker(k)).not.toThrow();
    }
  });
});

describe("globals.css is geldige CSS", () => {
  // Waarom dit bestaat: bij het herstructureren van het donkere blok bleef er één `}` te veel
  // staan. Alle twintig tests hierboven bleven groen — ze lezen de CSS als TEKST en zoeken
  // patronen, dus een structuurfout zien ze niet. De dev-server zag hem meteen ("Unexpected }"),
  // maar dat was pas ná het draaien van de suite. Deze test sluit dat gat.

  it("de accolades zijn in balans", () => {
    const zonderCommentaar = cssRuw.replace(/\/\*[\s\S]*?\*\//g, "");
    const open = (zonderCommentaar.match(/\{/g) || []).length;
    const dicht = (zonderCommentaar.match(/\}/g) || []).length;
    expect({ open, dicht }).toEqual({ open, dicht: open });
  });

  it("geen blok sluit dieper dan het opende", () => {
    // Een balans die klopt maar in de verkeerde volgorde staat, is nog steeds stuk.
    const zonderCommentaar = cssRuw.replace(/\/\*[\s\S]*?\*\//g, "");
    let diepte = 0;
    for (const c of zonderCommentaar) {
      if (c === "{") diepte++;
      else if (c === "}") diepte--;
      if (diepte < 0) break;
    }
    expect(diepte).toBe(0);
  });
});

describe("de constructie waar dark mode op leunt", () => {
  it("beide schakelaars mappen precies dezelfde tokens", () => {
    // De waarden staan één keer als --dm-*, maar de twee blokken die ze toepassen zijn met de hand
    // geschreven. Eén vergeten regel betekent dat "systeem donker" en "zelf donker" verschillen.
    const namen = (blok) => [...blok.matchAll(/--color-([a-z0-9-]+):\s*var\(--dm-/g)].map((m) => m[1]).sort();
    const media = css.slice(css.indexOf("prefers-color-scheme: dark"));
    const mediaBlok = media.slice(0, media.indexOf("\n    }"));
    const keuze = css.slice(css.indexOf(':root[data-theme="dark"]'));
    const keuzeBlok = keuze.slice(0, keuze.indexOf("\n  }"));
    expect(namen(mediaBlok)).toEqual(namen(keuzeBlok));
    expect(namen(keuzeBlok).length).toBeGreaterThan(15);
  });

  it("@theme is GEEN @theme inline", () => {
    // Met `inline` bakt Tailwind de hexwaarde in de utility in plaats van een var() — dan is
    // runtime omschakelen onmogelijk en is dit hele thema dood. Dit is de enige onomkeerbare fout
    // die je in globals.css kan maken.
    expect(css).toMatch(/@theme\s*\{/);
    expect(css).not.toMatch(/@theme\s+inline/);
  });

  it("LICHT is de standaard — het systeem volgen is een expliciete keuze", () => {
    // Dit hing eerst aan `:not([data-theme="light"])`, dus aan de AFWEZIGHEID van een keuze. Gevolg:
    // iedereen met een donker toestel kreeg de hele site donker, ook de marketingpagina's, ook wie
    // er nooit om vroeg. Het merk is fel groen op wit; dat ongevraagd omkeren is een
    // productbeslissing en geen technische standaard.
    expect(css).toMatch(/:root\[data-theme="system"\]/);
    expect(css).not.toMatch(/:root:not\(\[data-theme="light"\]\)/);
  });

  it("het logo wisselt mee, want een <img src> kan CSS niet omzetten", () => {
    // Het wordmark is donkerindigo op transparant en stond dus onzichtbaar in een donkere balk.
    expect(css).toMatch(/\.bij-donker \{ display: none; \}/);
    expect(css).toMatch(/:root\[data-theme="dark"\] \.bij-licht \{ display: none; \}/);
    const nav = fs.readFileSync(path.join(ROOT, "components/Nav.jsx"), "utf8");
    expect(nav).toMatch(/bij-licht[^"]*"[\s\S]{0,400}bij-donker/);
    expect(nav).toMatch(/logo-white\.png/);
  });

  it("de body krijgt een achtergrond die MEEFLIPT", () => {
    // Anders houdt de pagina het lichte thema en zie je een witte strook zodra je doorscrolt.
    // De klasse doet dit, niet een regel in globals.css: `bg-surface` is precies een token dat flipt.
    const layout = fs.readFileSync(path.join(ROOT, "app/layout.jsx"), "utf8");
    const body = /<body className="([^"]*)"/.exec(layout);
    expect(body).toBeTruthy();
    expect(body[1]).toMatch(/\bbg-(surface|paper)\b/);
    expect(body[1]).toMatch(/\btext-ink\b/);
  });

  it("het thema staat vóór de eerste verf, niet in een useEffect", () => {
    // Een thema dat pas na de hydratatie wordt toegepast, geeft bij elke paginalading een witte
    // flits — dezelfde fout als hydratatiefout #418, alleen zie je hem in plaats van dat hij in de
    // console staat.
    const layout = fs.readFileSync(path.join(ROOT, "app/layout.jsx"), "utf8");
    expect(layout).toMatch(/dangerouslySetInnerHTML/);
    expect(layout).toMatch(/fittin-thema/);
    expect(layout).toMatch(/suppressHydrationWarning/);
  });

  it("de focusring is zichtbaar in BEIDE thema's — op de kaart, de pagina en het indigo vlak", () => {
    // Deze ene regel in globals.css is de enige focusindicator van de app: op twee bestanden na zet
    // geen enkele component er zelf een. Stond de merkindigo erin, dan was hij in donker weg —
    // gemeten 1,19:1 op het kaartvlak, en 1,00:1 op een indigo vlak in ALLEBEI de thema's, want dan
    // is de ring exact de ondergrond. Niemand die met het toetsenbord werkt, ziet dan waar hij staat.
    const regel = /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-([a-z-]+)\)/.exec(css);
    expect(regel, "de basisregel voor :focus-visible is weg").toBeTruthy();
    const token = regel[1];

    for (const [thema, lees] of [["licht", licht], ["donker", donker]]) {
      const ring = lees(token);
      for (const vlak of ["surface", "paper", "brand"]) {
        // WCAG 1.4.11: een indicator heeft 3:1 nodig tegen wat eromheen ligt.
        expect(contrast(ring, lees(vlak)), `${token} op ${vlak} in ${thema}`).toBeGreaterThanOrEqual(AA_GROOT);
      }
    }
  });

  it("de schakelaar staat op ELKE pagina, niet alleen bij je instellingen", () => {
    // Hij stond eerst alleen op /account. Dat is waar hij HOORT, maar niet waar iemand hem vindt
    // die niet weet dat hij bestaat — en een bezoeker zonder account kwam er sowieso nooit.
    // De voetbalk zit in de site-layout en staat dus onder elke publieke én ledenpagina.
    const voet = fs.readFileSync(path.join(ROOT, "components/Footer.jsx"), "utf8");
    expect(voet).toMatch(/<ThemaKeuze variant="voet"/);
    expect(fs.readFileSync(path.join(ROOT, "app/(site)/layout.jsx"), "utf8")).toMatch(/<Footer\s*\/>/);
    // En de uitgebreide versie blijft bij de instellingen staan.
    expect(fs.readFileSync(path.join(ROOT, "app/(site)/account/page.jsx"), "utf8")).toMatch(/<ThemaKeuze \/>/);
  });

  it("maar één plek schrijft het thema weg", () => {
    // Twee schakelaars met elk hun eigen schrijfregel is hoe de ene ooit iets anders bewaart dan de
    // andere. `ThemaKeuze` heeft twee MATEN, geen twee implementaties — het scriptje in layout.jsx
    // leest de sleutel alleen.
    const schrijvers = [];
    (function loop(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const q = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules") loop(q); continue; }
        if (!/\.jsx?$/.test(q)) continue;
        // Op de sleutel én op het schrijven, niet op de twee samen in één aanroep: de sleutel staat
        // sinds kort in een constante, dus `setItem("fittin-thema", ...)` komt letterlijk niet meer
        // voor. Een test die op de oude vorm zocht, vond niets en zou dus ook een tweede schrijver
        // niet gezien hebben — precies het tegenovergestelde van wat ze moet doen.
        const bron = fs.readFileSync(q, "utf8");
        if (bron.includes("fittin-thema") && /localStorage\.setItem\(/.test(bron)) schrijvers.push(path.relative(ROOT, q));
      }
    })(path.join(ROOT, "components"));
    expect(schrijvers).toEqual([path.join("components", "ThemaKeuze.jsx")]);
  });

  it("de standaard is LICHT, en het scherm zegt dat ook", () => {
    // De kop bij de instellingen beweerde tot 11-09 dat de app standaard je toestel volgt. Dat was
    // ze één dag, en toen kreeg elke bezoeker met een donker toestel een donkere etalage. Sinds de
    // terugdraai is licht de standaard — en dan hoort er niet het omgekeerde boven de knoppen.
    const acc = fs.readFileSync(path.join(ROOT, "app/(site)/account/page.jsx"), "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(acc).not.toMatch(/Standaard volgt de app je toestel/);
    expect(acc).toMatch(/standaard licht/);
  });

  it("er staat geen transitie op de themawissel", () => {
    // Een transitie op de wissel sleept élk element van de pagina 150 ms mee — en de bewegingslaag
    // stuurt 497 transition-klassen vanuit datzelfde @theme-blok.
    expect(css).not.toMatch(/\[data-theme[^{]*\{[^}]*transition:/);
  });
});

describe("de sweep die betekenis van kleur scheidde", () => {
  const jsxBestanden = [];
  (function loop(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") loop(p); continue; }
      if (p.endsWith(".jsx")) jsxBestanden.push(p);
    }
  })(path.join(ROOT, "app"));
  (function loop(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { loop(p); continue; }
      if (p.endsWith(".jsx")) jsxBestanden.push(p);
    }
  })(path.join(ROOT, "components"));

  // RUWE bestandstekst, met commentaar en al. Dat is bewust grof, en het moet grof blijven.
  //
  // Ik heb hier één keer een commentaar-strip ingezet omdat de toelichting bij de themaschakelaar
  // de test liet afgaan. Nagemeten wat dat kostte: `accept="image/*"` in
  // app/beheer/coaches/[id]/page.jsx opent voor een regex een `/*`, die pas sluit bij het volgende
  // `*/` — 3.562 tekens verderop. Vijfentwintig className-strings vielen zo buiten de bewaking,
  // zonder dat iets het merkte. Een poort met een gat is erger dan een poort die te vaak piept.
  //
  // Schrijf je dus een toelichting bij een kleurkeuze: benoem de klasse niet letterlijk. Zie de
  // uitleg boven `InDeVoet` in components/ThemaKeuze.jsx voor hoe dat eruitziet.
  const inhoud = jsxBestanden.map((p) => ({ p, s: fs.readFileSync(p, "utf8") }));

  // DE REGEL, in een zin: `ink` is tekst op een vlak dat MEEFLIPT, `brand` is tekst op een vlak dat
  // dat NIET doet. De twee tests hieronder bewaken die ene regel van beide kanten.
  //
  // Een vlak dat niet meeflipt: het merkgroen `bg-accent`, of een lichte palettint (`bg-amber-50`),
  // allebei ZONDER opacity-modifier — met modifier ligt het op de kaart eronder en flipt het dus
  // effectief wel mee.
  // AMBER en ROOD staan hier NIET meer bij. Die hebben sinds de statuskleuren-ronde een donkere
  // tegenhanger (--dm-amber-50, --dm-red-50), dus ze flippen wél mee — en dan hoort de tekst erop
  // juist `ink` te zijn en niet `brand`. De rest van het Tailwind-palet heeft geen donkere variant
  // en blijft dus licht; zet je er een bij in globals.css, haal hem dan ook hier weg.
  const VAST_LICHT = /\bbg-(accent|green|blue|yellow|orange|emerald|sky|rose|lime|teal|indigo|violet|purple|pink|cyan|slate|gray|zinc|neutral|stone)(-(50|100|200))?(?![-\d/])/;
  const klassenStrings = (bron) => [...bron.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? "");

  it("text-brand staat alleen op vlakken die NIET meeflippen", () => {
    // Anders is het donkerblauwe tekst op een bijna-zwarte kaart.
    const zondaars = [];
    for (const f of inhoud) {
      for (const t of klassenStrings(f.s)) {
        if (/\btext-brand\b(?!deep)/.test(t) && !VAST_LICHT.test(t)) {
          zondaars.push(`${path.relative(ROOT, f.p)}: ${t.trim().slice(0, 70)}`);
        }
      }
    }
    expect(zondaars).toEqual([]);
  });

  it("text-ink staat NOOIT op een vlak dat niet meeflipt", () => {
    // De andere helft, en de helft die de eerste sweep massaal miste: 211 plekken. Gemeten toen het
    // misging: wit op groen gaf 1,5:1 voor het inbox-telletje, waar het 8,88:1 hoorde te zijn.
    const zondaars = [];
    for (const f of inhoud) {
      for (const t of klassenStrings(f.s)) {
        if (VAST_LICHT.test(t) && /\btext-ink\b(?!-soft)/.test(t)) {
          zondaars.push(`${path.relative(ROOT, f.p)}: ${t.trim().slice(0, 70)}`);
        }
      }
    }
    expect(zondaars).toEqual([]);
  });

  it("geen enkele component gebruikt nog bg-white als kaartvlak", () => {
    const zondaars = inhoud.filter((f) => /\bbg-white\b/.test(f.s)).map((f) => path.relative(ROOT, f.p));
    expect(zondaars).toEqual([]);
  });

  it("text-white bestaat nog wél — dat is tekst op groen en op indigo", () => {
    expect(inhoud.some((f) => /\btext-white\b/.test(f.s))).toBe(true);
  });

  it("de twee nieuwe tokens bestaan in het lichte thema", () => {
    expect(css).toMatch(/--color-surface:\s*#ffffff/);
    expect(css).toMatch(/--color-ink:\s*#22194f/);
  });
});
