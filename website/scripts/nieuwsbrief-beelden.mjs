// Maakt de beelden voor de nieuwsbrief over workouts & oefeningen.
//
// Het zijn échte schermafdrukken van de draaiende app — geen tekeningen. Draai eerst de dev-server
// (`npx next dev -p 3210`) en zet demodata klaar met `scripts/nieuwsbrief-demodata.mjs`; die zet enkel iets op het
// testaccount, zodat er nooit data van een echt lid in een mail naar honderden mensen belandt.
//
//   node --env-file=.env.local scripts/nieuwsbrief-beelden.mjs
//
// Playwright staat bewust NIET in package.json: het postinstall-script downloadt ~150 MB browsers
// en dat zou élke Vercel-build vertragen voor een script dat af en toe lokaal draait. Eenmalig:
//   npm i -D playwright --no-save && npx playwright install chromium
//
// De GIF wordt uit echte tussenstappen opgebouwd: het paneel gaat open, de sets worden ingevuld.
// Frame 1 moet daarom op zichzelf al iets zeggen — Outlook toont van een GIF enkel het eerste
// frame en sommige clients blokkeren animatie helemaal.
import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { authCookies } from "./screenshot-auth.mjs";

const run = promisify(execFile);
const BASIS = "http://localhost:3210";
const UIT = path.join(process.cwd(), "public", "nieuwsbrief");
const TMP = path.join(process.cwd(), ".tmp-frames");
const FFMPEG = process.env.FFMPEG_PATH
  || "C:/Users/gaeta/AppData/Local/Programs/Python/Python314/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";

await mkdir(UIT, { recursive: true });
await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
await ctx.addCookies(await authCookies("coach@fittin.be"));
const page = await ctx.newPage();

// De vaste onderbalk en de bovenste navigatie horen bij het telefoonframe, niet bij de functie die
// we uitleggen. Ze wegnemen scheelt ruis én voorkomt dat de balk over een uitsnede heen valt.
async function ga(pad) {
  await page.goto(BASIS + pad, { waitUntil: "networkidle", timeout: 90000 });
  await page.addStyleTag({ content: "* { scroll-behavior: auto !important; }" });
  // Op de berekende positie zoeken in plaats van op klassenamen: een uitsnede mag niet stukgaan
  // omdat iemand later een Tailwind-klasse anders schrijft.
  const weg = await page.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll("nav, header, [role=dialog]")) {
      const s = getComputedStyle(el);
      if (s.position === "fixed" || s.position === "sticky") { el.style.display = "none"; n++; }
    }
    // De dev-indicator van Next.js (het zwarte N-bolletje) zit in een eigen element buiten de
    // app-boom en komt dus niet in de lijst hierboven voor — hij stond wél op de eerste beelden.
    for (const el of document.querySelectorAll("nextjs-portal")) { el.style.display = "none"; n++; }
    return n;
  });
  console.log(`  (${pad}: ${weg} zwevende balk(en) verborgen)`);
  await page.waitForTimeout(700);
}

// Schermafdruk van één element. Playwright scrolt het element zelf in beeld en legt het volledig
// vast — betrouwbaarder dan zelf een uitsnede berekenen, want bij een uitsnede die hoger is dan het
// venster klopt de verticale positie niet meer.
// `maxH` snijdt daarna eventueel de onderkant weg: sommige panelen zijn te lang voor een mail.
async function knip(locator, naam, { maxH = null } = {}) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  let beeld = sharp(await locator.screenshot());
  if (maxH) {
    const m = await beeld.metadata();
    const h = Math.min(m.height, Math.round(maxH * 3)); // deviceScaleFactor 3
    if (h < m.height) beeld = sharp(await beeld.extract({ left: 0, top: 0, width: m.width, height: h }).toBuffer());
  }
  // Op 360px getoond in de mail; 760px levert een scherp beeld op retina zonder de mail zwaar te maken.
  await beeld.resize({ width: 760 }).png({ compressionLevel: 9 }).toFile(path.join(UIT, naam));
  const m = await sharp(path.join(UIT, naam)).metadata();
  console.log(`✓ ${naam} (${m.width}×${m.height})`);
}

// ---------- 1. De bibliotheek ----------
await ga("/oefeningen");
await knip(page.locator("main").first(), "bibliotheek.png", { maxH: 400 });

// ---------- 2. De drie knoppen op een oefening ----------
await ga("/oefeningen/barbell-bench-press-medium-grip");
const acties = page.locator("div").filter({ has: page.getByRole("button", { name: /Doe nu & log/ }) }).last();
await acties.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await knip(acties, "acties.png");

// ---------- 3. Animatie: het logpaneel invullen ----------
// Vaste uitsnede over alle frames, anders springt de GIF.
await page.getByRole("button", { name: /Doe nu & log/ }).click();
await page.waitForTimeout(400);
for (let i = 0; i < 2; i++) await page.getByText("＋ set", { exact: true }).click(); // 3 rijen: constante hoogte
await page.waitForTimeout(300);
// Enkel het invulpaneel in beeld, niet de knoppenrij erboven: die staat al bij punt 2 van de mail
// en tweemaal hetzelfde tonen maakt de mail langer zonder iets uit te leggen.
const paneelBox = await page.locator("div.rounded-2xl").filter({ hasText: /^BARBELL/i }).last().boundingBox();
const KLIP = {
  x: Math.max(0, paneelBox.x - 10), y: Math.max(0, paneelBox.y - 10),
  width: Math.min(390, paneelBox.width + 20), height: Math.min(900 - paneelBox.y, paneelBox.height + 20),
};

const frames = [];
const frame = async () => {
  const p = path.join(TMP, `f${String(frames.length).padStart(2, "0")}.png`);
  await sharp(await page.screenshot({ clip: KLIP })).resize({ width: 720 }).png().toFile(p);
  frames.push(p);
};
const reps = page.locator('input[inputmode="numeric"]');
const kg = page.locator('input[inputmode="decimal"]');
// De eerste set staat al ingevuld vóór het eerste frame: Outlook toont van een GIF enkel frame 1,
// en een volledig leeg formulier vertelt daar niets. Zo werkt het stilstaande beeld ook.
const invoer = [["10", "60"], ["10", "60"], ["8", "65"]];
for (let i = 0; i < invoer.length; i++) {
  await reps.nth(i).fill(invoer[i][0]);
  await kg.nth(i).fill(invoer[i][1]);
  await page.waitForTimeout(150);
  await frame();
}
await frame();                                                    // laatste beeld iets langer laten staan

// ---------- 4. Workout delen + overnemen ----------
await ga("/workouts/borst");
await knip(page.locator("section").first(), "workout.png");

// ---------- 5. Voortgang ----------
await ga("/training");
await knip(page.locator("#voortgang"), "voortgang.png", { maxH: 328 });

// ---------- 6. Je schema van vandaag ----------
// De hele oefeningkaart, niet enkel het tekstblok: de foto, het PR-label, de vooraf ingevulde
// sets en de "probeer …"-suggestie vertellen samen pas het verhaal.
const dagkaart = page.locator("div.rounded-2xl").filter({ hasText: /vorige keer/ }).first();
await dagkaart.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await knip(dagkaart, "schema.png", { maxH: 226 });

// ---------- 7. Delen: de kaart én de publieke pagina ----------
// Dit loopt de functie meteen ook écht door. Een beeld van een knop bewijst niets; pas als de link
// gemaakt is en een uitgelogde bezoeker de pagina ziet — zónder gewichten — mag ze in een mail
// naar honderden mensen aangekondigd worden.
const { program } = JSON.parse(await readFile("scripts/nieuwsbrief-demodata-ids.json", "utf8"));
await ga(`/plannen/${program}`);
const maak = page.getByRole("button", { name: /Maak deellink/ });
if (await maak.count()) { await maak.click(); await page.waitForTimeout(1200); }
const link = (await page.locator("body").innerText()).match(/https?:\/\/\S+\/w\/\w+/)?.[0];
if (!link) throw new Error("geen deellink gevonden");
// De dev-server draait met een localhost-adres in NEXT_PUBLIC_SITE_URL; in productie staat daar
// fittin.be. Voor het beeld zetten we dat recht, anders toont de mail een adres dat niemand kan openen.
await page.evaluate(() => { document.body.innerHTML = document.body.innerHTML.replace(/http:\/\/localhost:\d+\/w\//g, "https://fittin.be/w/"); });
await knip(page.locator("div").filter({ hasText: /^Je deellink staat klaar/ }).last(), "delen.png");

const anon = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
const gast = await anon.newPage();
await gast.goto(BASIS + new URL(link).pathname, { waitUntil: "networkidle", timeout: 90000 });
await gast.evaluate(() => {
  for (const el of document.querySelectorAll("nav, header")) { const s = getComputedStyle(el); if (s.position === "fixed" || s.position === "sticky") el.style.display = "none"; }
  for (const el of document.querySelectorAll("nextjs-portal")) el.style.display = "none";
});
const gasttekst = await gast.locator("main").first().innerText();
console.log("  gewichten zichtbaar voor een gast?", /\b\d{2,3}\s?kg\b/i.test(gasttekst) ? "JA — NIET VERSTUREN" : "nee ✓");
let gedeeld = sharp(await gast.locator("main").first().screenshot());
gedeeld = sharp(await gedeeld.extract({ left: 0, top: 0, width: (await gedeeld.metadata()).width, height: 256 * 3 }).toBuffer());
await gedeeld.resize({ width: 1200 }).png({ compressionLevel: 9 }).toFile(path.join(UIT, "gedeeld.png"));
console.log("✓ gedeeld.png");

await browser.close();

// ---------- GIF ----------
// palettegen/paletteuse: zonder eigen palet wordt platte UI met grote effen vlakken vuil.
try {
  await run(FFMPEG, ["-y", "-framerate", "0.8", "-i", path.join(TMP, "f%02d.png"),
    "-vf", "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse", "-loop", "0",
    path.join(UIT, "loggen.gif")]);
  console.log("✓ loggen.gif (" + frames.length + " frames)");
} catch (e) {
  console.error("GIF mislukt:", String(e.message || e).slice(0, 200));
}
await rm(TMP, { recursive: true, force: true });
