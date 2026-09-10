import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { oefeningRegel, workoutKop } from "./levering.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const lees = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("hoe een oefening in de mail staat", () => {
  it("zet sets, herhalingen, gewicht en rust op één regel", () => {
    expect(oefeningRegel({ naam: "Squat", sets: 3, reps: 8, kg: 60, rust: 120 }))
      .toBe("Squat — 3×8 · 60 kg · 120s rust");
  });

  it("laat weg wat er niet is — een oefening zonder gewicht toont geen 'null kg'", () => {
    expect(oefeningRegel({ naam: "Push-up", sets: 3, reps: 12, kg: null, rust: null }))
      .toBe("Push-up — 3×12");
  });

  it("zet de kop met week en sessie", () => {
    expect(workoutKop({ weekNr: 3, volgnummer: 2, totaal: 3, naam: "Onderlichaam" }))
      .toBe("Week 3 · sessie 2 van 3 — Onderlichaam");
  });
});

// Deze groep bewaakt keuzes die anders stilletjes verschuiven. Elke test noemt de val.
describe("de grenzen van de AI-coach", () => {
  it("de coachingpagina staat niet in Google", () => {
    // Een persoonlijk trainingsdossier hoort niet geïndexeerd te worden.
    expect(lees("app/(site)/coaching/page.jsx")).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("de zondagcron is beveiligd met CRON_SECRET", () => {
    const cron = lees("app/api/cron/coaching/route.js");
    expect(cron).toMatch(/CRON_SECRET/);
    expect(cron).toMatch(/Bearer \$\{secret\}/);
    expect(cron).toMatch(/status:\s*401/);
  });

  it("de deurcode gaat vóór de coaching — een fout mag nooit een deur dichthouden", () => {
    // De workout wordt met .catch() opgehaald in reminders.js. Zonder dat vangnet zou een fout in
    // de coaching betekenen dat een lid voor een gesloten deur staat.
    const r = lees("lib/reminders.js");
    expect(r).toMatch(/workoutVoorBoeking\([\s\S]{0,120}\.catch\(/);
  });

  it("alleen het LID krijgt de workout, niet de coach die dezelfde deurcode krijgt", () => {
    const r = lees("lib/reminders.js");
    // Er zijn twee sendAccessCode-aanroepen; maar één ervan mag `workout:` meegeven.
    const aantal = (r.match(/^\s*workout:/gm) || []).length;
    expect(aantal).toBe(1);
  });

  it("schrijven gebeurt met de service-role, niet met de sessie van het lid", () => {
    // 0157 geeft `authenticated` alleen SELECT. Een actie die met de gewone client zou schrijven,
    // faalt stil met 0 rijen — het bekende PostgREST-gedrag uit dit project.
    const a = lees("app/(site)/coaching/actions.js");
    expect(a).toMatch(/createAdminClient/);
  });

  it("elke actie controleert dat het dossier van de ingelogde gebruiker is", () => {
    // De service-role kent geen RLS. Zonder deze controle kan iemand met een gegokt id de sessie
    // van een ander afvinken.
    const a = lees("app/(site)/coaching/actions.js");
    expect(a).toMatch(/member_id !== mij\.user\.id/);
  });

  it("de prijstabel wordt afgedwongen vóór er een model aangeroepen wordt", () => {
    const m = lees("lib/coaching/model.js");
    expect(m).toMatch(/if \(!isGeprijsd\(model\)\)/);
  });

  it("gebruikt een EIGEN gateway-sleutel zodat de kost apart zichtbaar is", () => {
    expect(lees("lib/coaching/model.js")).toMatch(/COACH_AI_GATEWAY_KEY/);
  });

  it("de privacyverklaring noemt het model als verwerker", () => {
    // Zonder deze vermelding is elke aanroep een doorgifte aan een niet-vermelde verwerker — dat
    // was precies de reden dat de vorige AI-generator uitgezet werd (audit G0-6).
    const p = lees("app/(site)/privacy/page.jsx");
    expect(p).toMatch(/Anthropic/);
    expect(p).toMatch(/Fittin&rsquo; Coaching/);
    expect(p).toMatch(/art\. 9\.2\.a AVG/);
  });
});
