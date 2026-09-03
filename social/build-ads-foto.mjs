// Bouwt Meta-advertenties MET ECHT BEELD van de zaal, in plaats van de kale tekstkaarten uit
// build-ads.mjs (juni 2026).
//
// WAAROM: die eerste set was 100 % typografie. Voor een gym is dat de zwakste vorm die er is —
// mensen willen de ruimte zien, en Meta's veiling straft statisch tekstbeeld af met een lagere
// doorklik. Er ligt 25 seconden echte opname van de zaal in _raw-assets/video2-source.mp4, met
// precies het beeld dat de hele propositie vertelt: een lege zaal met het logo op de muur.
// "De hele zaal, alleen voor jou" hoef je dan niet uit te leggen.
//
// Pijplijn (zelfde als build-ads.mjs): frame uit de video -> HTML met overlay -> headless Chrome
// @2x -> sharp naar exacte px. Draai: node build-ads-foto.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "file:///C:/Users/gaeta/Documents/Claude/Projects/fittin/website/node_modules/sharp/lib/index.js";

const DIR = dirname(fileURLToPath(import.meta.url));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const VIDEO = join(DIR, "..", "_raw-assets", "video2-source.mp4");
const TMP = join(DIR, ".tmp-foto");
const UIT = join(DIR, "foto");
const FFMPEG = process.env.FFMPEG_EXE ||
  "C:/Users/gaeta/AppData/Local/Programs/Python/Python314/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";

for (const d of [TMP, UIT]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

// ── 1. Frames uit de opname ──────────────────────────────────────────────────────────
// 16s = de lege zaal met het logo op de muur (de sterkste). 8s = iemand die traint in het licht.
const FRAMES = [
  { id: "zaal", tijd: "00:00:16.5" },
  { id: "training", tijd: "00:00:08.0" },
];
for (const f of FRAMES) {
  const uit = join(TMP, `${f.id}.jpg`);
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-ss", f.tijd, "-i", VIDEO, "-frames:v", "1", "-q:v", "2", uit, "-y"]);
}

const dataUri = (p) => `data:image/jpeg;base64,${readFileSync(p).toString("base64")}`;

// ── 2. De overlay ────────────────────────────────────────────────────────────────────
const FONTS = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap" rel="stylesheet">`;

// De opname is bewust donker gefilmd. `brightness`/`saturate` tilt hem net genoeg op om leesbaar
// te blijven op een telefoon in de zon, zonder dat het beeld nep wordt.
const css = (w, h) => `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px}
body{font-family:'Lato',system-ui,Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
.cv{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:#22194F}
.foto{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(1.28) saturate(1.05) contrast(1.04)}
/* Verloop van onder: de tekst moet leesbaar zijn zonder de zaal te verbergen. */
.mask{position:absolute;inset:0;background:linear-gradient(180deg,rgba(34,25,79,.62) 0%,rgba(34,25,79,.12) 34%,rgba(34,25,79,.72) 62%,rgba(34,25,79,.96) 100%)}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;color:#fff}
.wm{font-weight:900;letter-spacing:-.02em;line-height:1}.ap{color:#5FDA6B}
.tag{display:inline-flex;align-items:center;border:2px solid rgba(255,255,255,.45);border-radius:999px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
.eyebrow{color:#5FDA6B;text-transform:uppercase;font-weight:900;letter-spacing:.2em}
h1{font-weight:900;letter-spacing:-.03em;line-height:.98}
.green{color:#5FDA6B}
.sub{color:rgba(255,255,255,.88);font-weight:700}
.pill{display:inline-flex;align-items:center;background:#5FDA6B;color:#16331d;font-weight:900;border-radius:999px}
.handle{color:rgba(255,255,255,.6);font-weight:700}
`;

const CONCEPTEN = [
  {
    id: "zaal-alleen", frame: "zaal",
    eyebrow: "Privégym in Gent",
    kop: `De hele zaal.<br><span class="green">Alleen voor jou.</span>`,
    sub: "Geen lidgeld — je betaalt enkel voor je uur.",
    cta: "Je 1e sessie gratis &rarr;",
  },
  {
    id: "geen-lidgeld", frame: "training",
    eyebrow: "Sint-Amandsberg",
    kop: `€ 15 per uur.<br><span class="green">Geen lidgeld.</span>`,
    sub: "Boek online, open de deur met je telefoon.",
    cta: "Bekijk de uren &rarr;",
  },
  {
    id: "niemand-wacht", frame: "zaal",
    eyebrow: "Privégym in Gent",
    kop: `Niemand die wacht<br>op <span class="green">jouw toestel.</span>`,
    sub: "Eén uur, de zaal exclusief, tot 4 personen.",
    cta: "Boek je gratis uur &rarr;",
  },
];

const html = (c, w, h) => {
  const vert = h > w;
  const pad = vert ? 96 : 76;
  const kop = vert ? 108 : 92;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${css(w, h)}</style></head><body>
  <div class="cv">
    <img class="foto" src="${dataUri(join(TMP, `${c.frame}.jpg`))}">
    <div class="mask"></div>
    <div class="wrap" style="padding:${pad}px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="wm" style="font-size:${vert ? 62 : 54}px">Fittin<span class="ap">&rsquo;</span></div>
        <div class="tag" style="font-size:${vert ? 22 : 19}px;padding:${vert ? 11 : 9}px ${vert ? 24 : 20}px">Gent</div>
      </div>
      <div>
        <div class="eyebrow" style="font-size:${vert ? 26 : 23}px">${c.eyebrow}</div>
        <h1 style="font-size:${kop}px;margin-top:${vert ? 20 : 16}px">${c.kop}</h1>
        <p class="sub" style="font-size:${vert ? 34 : 30}px;margin-top:${vert ? 24 : 18}px">${c.sub}</p>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:${vert ? 46 : 34}px">
          <div class="pill" style="font-size:${vert ? 32 : 28}px;padding:${vert ? 22 : 18}px ${vert ? 40 : 34}px">${c.cta}</div>
          <div class="handle" style="font-size:${vert ? 24 : 21}px">@fittin_gent</div>
        </div>
      </div>
    </div>
  </div></body></html>`;
};

const MATEN = [{ n: "1x1", w: 1080, h: 1080 }, { n: "9x16", w: 1080, h: 1920 }, { n: "4x5", w: 1080, h: 1350 }];

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

// ── 3. Videoversies ──────────────────────────────────────────────────────────────────
// Video verslaat een statisch beeld bijna altijd in de veiling, en er ligt echte opname klaar.
// Bewust ZONDER ingebrande tekst: die zet je in Meta zelf, zodat je hem kan wisselen zonder
// opnieuw te renderen. 12 seconden — lang genoeg om de zaal te tonen, kort genoeg om uit te kijken.
const VIDEOS = [
  { n: "9x16", vf: "crop=ih*9/16:ih,scale=1080:1920,eq=brightness=0.06:saturation=1.05" },
  { n: "1x1", vf: "crop=ih:ih,scale=1080:1080,eq=brightness=0.06:saturation=1.05" },
];
for (const v of VIDEOS) {
  const uit = join(UIT, `zaal-${v.n}.mp4`);
  execFileSync(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-ss", "00:00:06.0", "-t", "12", "-i", VIDEO,
    "-vf", v.vf, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "23",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", uit, "-y",
  ]);
  console.log(`✓ foto/zaal-${v.n}.mp4`);
}
console.log("\nKlaar. Alles staat in social/foto/");
