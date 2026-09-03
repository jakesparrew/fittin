// End-to-end proef van het meldpunt en de sterrenvraag (0150), met Playwright.
//
// De belangrijkste controle staat onderaan: de reviewvraag moet bij 1 ster WOORDELIJK dezelfde
// zijn als bij 5. Google's beleid verbiedt "selectief vragen om positieve reviews" en de sanctie
// loopt tot schorsing van het bedrijfsprofiel — dus dit is geen stijlkwestie maar een poort.
//
//   node --env-file=.env.local scripts/test-meldpunt.mjs
//
// Werkt op een bestaande boeking van het testaccount en ruimt alles achteraf op.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASIS = process.env.PROEF_BASIS || "http://localhost:3100";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let stappen = 0, gezakt = 0;
const ok = (t, m) => { stappen++; if (!t) gezakt++; console.log(`${t ? "OK  " : "FOUT"}  ${m}`); };

const TOKEN = "proef" + "0".repeat(27);
let booking = null;

try {
  // Een voorbije, bevestigde sessie van het testaccount lenen — we schrijven alleen het token.
  const { data: test } = await admin.from("profiles").select("id, gym_id").eq("email", "coach@fittin.be").single();
  // Een eigen proefsessie van 2 uur geleden. gratis_code + EUR 0, zodat ze in geen enkele
  // omzet- of abo-telling meedoet mocht ze onverhoopt blijven staan; de opkuis wist ze sowieso.
  const { data: dienst } = await admin.from("services").select("id").eq("gym_id", test.gym_id).limit(1).single();
  // De zaal is exclusief per tijdslot (exclusion constraint bookings_no_overlap), dus we zoeken
  // een vrij uur in het recente verleden in plaats van er een te forceren.
  let b = null, bErr = null;
  for (let uren = 2; uren <= 72 && !b; uren++) {
    const start = new Date(Date.now() - uren * 3600000);
    const r = await admin.from("bookings").insert({
      gym_id: test.gym_id, user_id: test.id, service_id: dienst.id,
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3600000).toISOString(),
      status: "bevestigd", paid: true, price_cents: 0, payment_source: "gratis_code",
      persons: 1, report_token: TOKEN,
    }).select("id").single();
    b = r.data; bErr = r.error;
  }
  if (!b) throw new Error("geen vrij uur gevonden voor de proefboeking: " + (bErr?.message || "?"));
  booking = { id: b.id, tijdelijk: true };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(String(e).slice(0, 160)));

  // ── 1. Melden zonder in te loggen ──────────────────────────────────────────────────
  await page.goto(`${BASIS}/m/${TOKEN}`, { waitUntil: "networkidle", timeout: 90000 });
  ok(await page.getByRole("heading", { name: "Wat is er mis?" }).isVisible(), "het meldscherm opent zonder login");

  await page.getByRole("button", { name: /Toestel stuk/ }).click();
  await page.getByPlaceholder(/Welk toestel/).fill("Proef — kabel van de lat rafelt");
  await page.getByRole("button", { name: "Versturen" }).click();
  await page.getByRole("heading", { name: "Bedankt" }).waitFor({ timeout: 20000 });
  ok(true, "melden lukt in twee tikken");

  const { data: melding } = await admin.from("problem_reports").select("*").eq("booking_id", booking.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  ok(melding?.category === "toestel", `de categorie is bewaard (${melding?.category})`);
  ok(melding?.booking_id === booking.id, "de melding hangt aan de juiste sessie");
  ok(!melding?.resolved_at, "de melding staat open");

  // ── 2. De waarschuwing reist mee naar de volgende bezoeker ──────────────────────────
  await admin.from("problem_reports").update({ public_note: "PROEF: de roeier staat buiten dienst" }).eq("id", melding.id);
  const { openMeldingNotitie } = await import("../lib/meldpunt.js");
  const notitie = await openMeldingNotitie(admin, melding.gym_id);
  ok(notitie === "PROEF: de roeier staat buiten dienst", "de zaalnotitie komt in de deurcodemail terecht");

  await admin.from("problem_reports").update({ resolved_at: new Date().toISOString(), public_note: null }).eq("id", melding.id);
  ok((await openMeldingNotitie(admin, melding.gym_id)) === null, "opgelost = de waarschuwing verdwijnt weer");

  // ── 3. De sterrenvraag ─────────────────────────────────────────────────────────────
  await page.goto(`${BASIS}/f/${TOKEN}?s=5`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const { data: score5 } = await admin.from("session_feedback").select("rating").eq("booking_id", booking.id).maybeSingle();
  ok(score5?.rating === 5, `één tik in de mail legt de score vast (${score5?.rating})`);
  const bij5 = await page.locator("body").innerText();

  // ── 4. DE POORT: dezelfde vraag bij een lage score ─────────────────────────────────
  await page.goto(`${BASIS}/f/${TOKEN}?s=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const { data: score1 } = await admin.from("session_feedback").select("rating").eq("booking_id", booking.id).maybeSingle();
  ok(score1?.rating === 1, "opnieuw tikken corrigeert de score i.p.v. een tweede rij te maken");
  const bij1 = await page.locator("body").innerText();

  const reviewZin = "Schrijf een review op Google";
  ok(bij5.includes(reviewZin), "bij 5 sterren staat de Google-vraag er");
  ok(bij1.includes(reviewZin), "bij 1 ster staat DEZELFDE Google-vraag er — geen selectief vragen");
  const zin = (t) => t.slice(t.indexOf("Help anderen ons vinden"), t.indexOf(reviewZin) + reviewZin.length);
  ok(zin(bij1) === zin(bij5), "de tekst is woordelijk identiek voor beide scores");

  // ── 5. Uitschrijven werkt zonder login ─────────────────────────────────────────────
  await page.goto(`${BASIS}/f/${TOKEN}/uit`, { waitUntil: "networkidle" });
  const { data: prof } = await admin.from("profiles").select("feedback_opt_out").eq("email", "coach@fittin.be").single();
  ok(prof?.feedback_opt_out === true, "de uitschrijflink zet de vraag uit");

  ok(fouten.length === 0, `geen javascriptfouten (${fouten.length}) ${fouten.slice(0, 2).join(" | ")}`);
  await browser.close();
} catch (e) {
  gezakt++;
  console.log("FOUT  onverwacht:", e.message);
} finally {
  if (booking) {
    await admin.from("session_feedback").delete().eq("booking_id", booking.id);
    await admin.from("problem_reports").delete().eq("booking_id", booking.id);
    await admin.from("bookings").delete().eq("id", booking.id);
    const { data: t } = await admin.from("profiles").select("id").eq("email", "coach@fittin.be").single();
    await admin.from("profiles").update({ feedback_opt_out: false }).eq("id", t.id);
    await admin.from("notifications").delete().ilike("body", "%Proef — kabel%");
    console.log("\nopgeruimd — token, score, melding en opt-out teruggezet");
  }
  console.log(`${stappen - gezakt}/${stappen} geslaagd`);
  process.exit(gezakt ? 1 : 0);
}
