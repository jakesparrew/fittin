// Bouwt Meta-advertenties met de ECHTE fotoreportage van de zaal.
//
// GESCHIEDENIS: de eerste set (build-ads.mjs, juni) was 100 % typografie — de zwakste vorm voor een
// gym, want mensen willen de ruimte zien. Versie twee gebruikte frames uit de promovideo; bruikbaar,
// maar donker en korrelig. Deze versie gebruikt de fotoreportage die de eigenaar op 3 september
// aanleverde, en die is een klasse beter: helder, scherp, met het logo op de muur in beeld.
//
// De foto's staan als originelen in ../_raw-assets/foto/ (buiten de repo) en zijn daar gezet door
// website/scripts/import-fotos.mjs. Draai dat eerst als de map leeg is.
//
// Pijplijn: foto -> HTML met overlay -> headless Chrome @2x -> sharp naar exacte px.
// Draai: node build-ads-foto.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "file:///C:/Users/gaeta/Documents/Claude/Projects/fittin/website/node_modules/sharp/lib/index.js";

const DIR = dirname(fileURLToPath(import.meta.url));
const FOTOS = join(DIR, "..", "_raw-assets", "foto");
const VIDEO = join(DIR, "..", "_raw-assets", "video2-source.mp4");
const TMP = join(DIR, ".tmp-foto");
const UIT = join(DIR, "foto");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG_EXE ||
  "C:/Users/gaeta/AppData/Local/Programs/Python/Python314/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";

for (const d of [TMP, UIT]) if (!existsSync(d)) mkdirSync(d, { recursive: true });
if (!existsSync(join(FOTOS, "zaal-breed.jpeg"))) {
  console.error("Geen foto's gevonden. Draai eerst:\n  cd ../website && node scripts/import-fotos.mjs \"<map met originelen>\"");
  process.exit(1);
}

const FONTS = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap" rel="stylesheet">`;

// De foto's zijn helder en scherp; ze hebben géén opgetilde helderheid nodig zoals de videoframes.
// Wat ze wél nodig hebben is een steviger verloop onderaan: witte muren en spiegels maken witte
// letters onleesbaar zodra er geen donker vlak onder zit.
const css = (w, h) => `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px}
body{font-family:'Lato',system-ui,Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
.cv{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:#22194F}
.foto{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mask{position:absolute;inset:0;background:linear-gradient(180deg,rgba(34,25,79,.55) 0%,rgba(34,25,79,.08) 30%,rgba(34,25,79,.55) 55%,rgba(34,25,79,.94) 82%,rgba(34,25,79,.99) 100%)}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;color:#fff}
.wm{font-weight:900;letter-spacing:-.02em;line-height:1;text-shadow:0 2px 12px rgba(34,25,79,.5)}.ap{color:#5FDA6B}
.tag{display:inline-flex;align-items:center;border:2px solid rgba(255,255,255,.5);border-radius:999px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;backdrop-filter:blur(4px)}
.eyebrow{color:#5FDA6B;text-transform:uppercase;font-weight:900;letter-spacing:.2em}
h1{font-weight:900;letter-spacing:-.03em;line-height:.98}
.green{color:#5FDA6B}
.sub{color:rgba(255,255,255,.9);font-weight:700}
.pill{display:inline-flex;align-items:center;background:#5FDA6B;color:#16331d;font-weight:900;border-radius:999px}
.handle{color:rgba(255,255,255,.65);font-weight:700}
`;

// `pos` stuurt object-position: bij een staande crop van een liggende foto wil je niet altijd het
// midden — de lege zaal leest beter iets hoger, de dumbbells net iets naar links.
const CONCEPTEN = [
  {
    // zaal-logo-2 en niet zaal-breed: die laatste heet in de reportage "(voorkeur)" maar is een
    // close-up van een halterstang. Bij de kop "De hele zaal" moet je de HELE zaal zien, met het
    // logo op de muur — dat is wat deze opname doet. De voorkeursfoto krijgt een eigen plek op
    // de site, waar een detailopname wél werkt.
    id: "zaal-alleen", foto: "zaal-logo-2", pos: "50% 45%",
    eyebrow: "Privégym in Gent",
    kop: `De hele zaal.<br><span class="green">Alleen voor jou.</span>`,
    sub: "Geen lidgeld — je betaalt enkel voor je uur.",
    cta: "Je 1e sessie gratis &rarr;",
  },
  {
    // Andere foto dan de zaalopname, op vraag van de eigenaar: de dumbbellrij is scherp, rustig en
    // vertelt "materiaal in orde" — precies wat je naast een prijs wil zetten.
    id: "geen-lidgeld", foto: "dumbbells", pos: "45% 50%",
    eyebrow: "Sint-Amandsberg",
    kop: `€ 15 per uur.<br><span class="green">Geen lidgeld.</span>`,
    sub: "Boek online, open de deur met je telefoon.",
    cta: "Bekijk de uren &rarr;",
  },
  {
    id: "niemand-wacht", foto: "zaal-logo", pos: "50% 48%",
    eyebrow: "Privégym in Gent",
    kop: `Niemand die wacht<br>op <span class="green">jouw toestel.</span>`,
    sub: "Eén uur, de zaal exclusief, tot 4 personen.",
    cta: "Boek je gratis uur &rarr;",
  },
  {
    // Vierde concept, mogelijk gemaakt door de nieuwe reportage: een coach die iemand begeleidt.
    // Dit is de enige advertentie die de PT-tak verkoopt in plaats van de zaal.
    id: "met-coach", foto: "training-duo", pos: "50% 45%",
    eyebrow: "Personal training in Gent",
    kop: `Eén uur.<br><span class="green">Eén coach. Jij.</span>`,
    sub: "Gratis intake en proeftraining, daarna € 60 per sessie.",
    cta: "Plan je intake &rarr;",
  },
];

const MATEN = [{ n: "1x1", w: 1080, h: 1080 }, { n: "4x5", w: 1080, h: 1350 }, { n: "9x16", w: 1080, h: 1920 }];

const dataUri = (slug) => `data:image/jpeg;base64,${readFileSync(join(FOTOS, `${slug}.jpeg`)).toString("base64")}`;

const html = (c, w, h) => {
  const vert = h > w;
  const pad = vert ? 92 : 74;
  const kop = h >= 1920 ? 104 : vert ? 96 : 88;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${css(w, h)}</style></head><body>
  <div class="cv">
    <img class="foto" style="object-position:${c.pos}" src="${dataUri(c.foto)}">
    <div class="mask"></div>
    <div class="wrap" style="padding:${pad}px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="wm" style="font-size:${vert ? 60 : 52}px">Fittin<span class="ap">&rsquo;</span></div>
        <div class="tag" style="font-size:${vert ? 21 : 18}px;padding:${vert ? 10 : 8}px ${vert ? 22 : 19}px">Gent</div>
      </div>
      <div>
        <div class="eyebrow" style="font-size:${vert ? 25 : 22}px">${c.eyebrow}</div>
        <h1 style="font-size:${kop}px;margin-top:${vert ? 18 : 14}px">${c.kop}</h1>
        <p class="sub" style="font-size:${vert ? 33 : 29}px;margin-top:${vert ? 22 : 17}px">${c.sub}</p>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:${vert ? 42 : 32}px">
          <div class="pill" style="font-size:${vert ? 31 : 27}px;padding:${vert ? 21 : 17}px ${vert ? 38 : 32}px">${c.cta}</div>
          <div class="handle" style="font-size:${vert ? 23 : 20}px">@fittin_gent</div>
        </div>
      </div>
    </div>
  </div></body></html>`;
};

for (const c of CONCEPTEN) {
  for (const m of MATEN) {
    const htmlPad = join(TMP, `${c.id}-${m.n}.html`);
    const ruw = join(TMP, `${c.id}-${m.n}.raw.png`);
    writeFileSync(htmlPad, html(c, m.w, m.h));
    execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
      `--window-size=${m.w},${m.h}`, `--screenshot=${ruw}`, `file:///${htmlPad.replace(/\\/g, "/")}`,
    ], { stdio: "ignore" });
    await sharp(ruw).resize(m.w, m.h).jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
      .toFile(join(UIT, `${c.id}-${m.n}.jpg`));
    console.log(`✓ foto/${c.id}-${m.n}.jpg`);
  }
}

// Videoversies uit de promo-opname. Bewust zonder ingebrande tekst: die zet je in Meta zelf, zodat
// je de kop kan wisselen zonder opnieuw te renderen.
if (existsSync(VIDEO)) {
  for (const v of [
    { n: "9x16", vf: "crop=ih*9/16:ih,scale=1080:1920,eq=brightness=0.06:saturation=1.05" },
    { n: "1x1", vf: "crop=ih:ih,scale=1080:1080,eq=brightness=0.06:saturation=1.05" },
  ]) {
    execFileSync(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-ss", "00:00:06.0", "-t", "12", "-i", VIDEO,
      "-vf", v.vf, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "23",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(UIT, `zaal-${v.n}.mp4`), "-y",
    ]);
    console.log(`✓ foto/zaal-${v.n}.mp4`);
  }
}
console.log("\nKlaar. Alles staat in social/foto/");
