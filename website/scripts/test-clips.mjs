// End-to-end proef van de bewaarde-videobibliotheek (0149), met Playwright.
//
// WAAROM PLAYWRIGHT EN NIET HET BROWSERPANEEL: dat paneel draait met `document.hidden === true`.
// React onthult gestreamde Suspense-segmenten dan niet en hydrateert niet, dus kliks doen niets en
// rects zijn 0×0 — je meet een pagina die nooit tot leven kwam. Zie fittin-lokaal-verifieren.
//
//   node --env-file=.env.local scripts/test-clips.mjs
//
// Ruimt alles wat het aanmaakt achteraf zelf op.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { authCookies } from "./screenshot-auth.mjs";

const BASIS = process.env.PROEF_BASIS || "http://localhost:3100";
const EMAIL = "coach@fittin.be";
const REEL = "https://www.instagram.com/reel/DcMScVaoKMc/?igsi=MTNlNWhud3Nza3Z0Zg==";
const NAAM = "Proef — bulletproof knees";
const MAP = "Proefmap leg day";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let stappen = 0, gezakt = 0;
const ok = (t, m) => { stappen++; if (!t) gezakt++; console.log(`${t ? "OK  " : "FOUT"}  ${m}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies(await authCookies(EMAIL));
const page = await ctx.newPage();
const fouten = [];
page.on("pageerror", (e) => fouten.push(String(e)));

try {
  // ── 1. Bewaren ─────────────────────────────────────────────────────────────────────
  await page.goto(`${BASIS}/bewaard`, { waitUntil: "networkidle" });
  ok(await page.getByRole("heading", { name: /Mijn video/ }).isVisible(), "de bibliotheek opent");

  await page.getByRole("button", { name: "+ Video bewaren" }).click();
  await page.getByPlaceholder(/Plak hier de link/).fill(REEL);
  ok(await page.getByText("Instagram herkend ✓").isVisible(), "de link wordt meteen herkend als Instagram");

  await page.getByPlaceholder("bv. Bulgarian split squat").fill(NAAM);
  await page.getByRole("button", { name: "+ Nieuwe map" }).click();
  await page.getByPlaceholder("bv. Leg day").fill(MAP);
  await page.getByRole("button", { name: "Bewaren", exact: true }).click();
  await page.getByRole("heading", { name: "Bewaard" }).waitFor({ timeout: 15000 });
  ok(true, "bewaren gaf een bevestiging");

  // ── 2. Staat het er echt, en netjes? ───────────────────────────────────────────────
  const { data: rij } = await admin.from("clips").select("*").eq("title", NAAM).maybeSingle();
  ok(!!rij, "de rij staat in de databank");
  ok(rij?.url === "https://www.instagram.com/reel/DcMScVaoKMc/", `tracking-parameters zijn eraf: ${rij?.url}`);
  ok(rij?.provider === "instagram" && rij?.ref === "DcMScVaoKMc", "bron en code kloppen");
  ok(!!rij?.folder_id, "de nieuwe map is aangemaakt en gekoppeld");

  // ── 3. Dubbel bewaren maakt geen tweede kaart ──────────────────────────────────────
  await page.getByRole("button", { name: "Nog een bewaren" }).click();
  await page.getByPlaceholder(/Plak hier de link/).fill(REEL);
  await page.getByRole("button", { name: "Bewaren", exact: true }).click();
  await page.getByRole("heading", { name: "Stond er al" }).waitFor({ timeout: 15000 });
  const { count } = await admin.from("clips").select("id", { count: "exact", head: true }).eq("url", "https://www.instagram.com/reel/DcMScVaoKMc/");
  ok(count === 1, `dezelfde link twee keer bewaren geeft één kaart (nu ${count})`);
  const { data: naOpnieuw } = await admin.from("clips").select("title, folder_id").eq("url", "https://www.instagram.com/reel/DcMScVaoKMc/").maybeSingle();
  ok(naOpnieuw?.title === NAAM, `de naam overleeft een tweede keer bewaren zonder titel (${naOpnieuw?.title})`);
  ok(!!naOpnieuw?.folder_id, "en de map ook");

  // ── 4. De kaart en het kader ───────────────────────────────────────────────────────
  await page.goto(`${BASIS}/bewaard`, { waitUntil: "networkidle" });
  const kaart = page.getByRole("button", { name: new RegExp(NAAM.slice(0, 20)) });
  ok(await kaart.isVisible(), "de kaart staat in de bibliotheek");
  ok(await page.getByRole("button", { name: new RegExp(`^${MAP}`) }).isVisible(), "de map staat als filter bovenaan");

  await kaart.click();
  const frame = page.locator('iframe[title]');
  await frame.waitFor({ timeout: 10000 });
  const src = await frame.getAttribute("src");
  ok(src === "https://www.instagram.com/reel/DcMScVaoKMc/embed/captioned/", `het kader wijst naar Instagram: ${src}`);

  // Écht geladen, geen leeg vak: het kader moet een eigen document hebben met inhoud.
  const hoogte = await frame.evaluate((el) => el.getBoundingClientRect().height);
  ok(hoogte > 300, `het kader heeft echte hoogte (${Math.round(hoogte)}px)`);

  // ── 5. Coach: van clip naar oefening ───────────────────────────────────────────────
  await page.getByRole("button", { name: "Maak er een oefening van" }).click();
  await page.getByText(/staat nu bij je oefeningen|Stond er al als/).waitFor({ timeout: 15000 });
  const { data: oef } = await admin.from("exercises").select("id, name, video_url, coach_id").eq("video_url", rij.url).maybeSingle();
  ok(!!oef, "er is een oefening aangemaakt");
  ok(oef?.name === NAAM.slice(0, 80), "de oefening draagt de naam van de clip");
  ok(!!oef?.coach_id, "de oefening hangt aan de coach, niet aan de gym-brede bibliotheek");

  // Tweede keer omzetten mag geen duplicaat maken.
  await page.getByRole("button", { name: "Maak er een oefening van" }).click();
  await page.getByText(/Stond er al als/).waitFor({ timeout: 15000 });
  const { count: nOef } = await admin.from("exercises").select("id", { count: "exact", head: true }).eq("video_url", rij.url);
  ok(nOef === 1, `twee keer omzetten geeft één oefening (nu ${nOef})`);

  // ── 6. De publieke bibliotheek blijft gym-breed ────────────────────────────────────
  const uit = await ctx.newPage();
  await uit.goto(`${BASIS}/oefeningen`, { waitUntil: "networkidle" });
  const tekst = await uit.locator("body").innerText();
  ok(!tekst.includes(NAAM), "de coach-oefening verschijnt NIET in de publieke bibliotheek");
  await uit.close();

  ok(fouten.length === 0, `geen javascript-fouten (${fouten.length}): ${fouten.slice(0, 2).join(" | ")}`);
} catch (e) {
  gezakt++;
  console.log("FOUT  onverwacht:", e.message);
} finally {
  // ── Opruimen ───────────────────────────────────────────────────────────────────────
  await admin.from("exercises").delete().eq("video_url", "https://www.instagram.com/reel/DcMScVaoKMc/");
  await admin.from("clips").delete().eq("url", "https://www.instagram.com/reel/DcMScVaoKMc/");
  await admin.from("clip_folders").delete().eq("name", MAP);
  const { count: rest } = await admin.from("clips").select("id", { count: "exact", head: true });
  console.log(`\nopgeruimd — ${rest} clip(s) over in de databank`);
  await browser.close();
  console.log(`${stappen - gezakt}/${stappen} geslaagd`);
  process.exit(gezakt ? 1 : 0);
}
