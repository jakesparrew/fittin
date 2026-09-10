import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { oefeningRegel, workoutKop, afvinkPad, AFVINK_OORDELEN } from "./levering.js";

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

  it("het maaltijdscherm sleept de servermodule niet naar de browser", () => {
    // `maaltijd.js` importeert het model, het budget en de databank. Eén lijstje labels hoort dat
    // niet mee de client-bundel in te trekken — daarvoor bestaat voeding-velden.js.
    const c = lees("components/coaching/MaaltijdPaneel.jsx");
    expect(c).toMatch(/from "@\/lib\/coaching\/voeding-velden\.js"/);
    expect(c).not.toMatch(/from "@\/lib\/coaching\/maaltijd\.js"/);
  });

  it("het menu blijft weg uit wat een coach te zien krijgt", () => {
    // 0158 geeft coaching_mealweeks bewust GEEN coachbeleid: voeding is gevoeliger dan een schema.
    const p = lees("lib/coaching/plan.js");
    const stuk = p.slice(p.indexOf("export async function dossierVoorCoach"));
    expect(stuk).not.toMatch(/coaching_mealweeks/);
  });

  it("een menu kan nooit zonder toestemming vertrekken", () => {
    // De poort staat in richtlijnVoor, en élke weg naar een menu loopt daarlangs — ook het
    // goedkope pad dat het menu van vorige week meeneemt.
    const m = lees("lib/coaching/maaltijd.js");
    expect(m).toMatch(/export function richtlijnVoor[\s\S]{0,300}coaching_toestemming_at/);
    const zorg = m.slice(m.indexOf("export async function zorgVoorMenu"));
    expect(zorg).toMatch(/richtlijnVoor\(profiel\)/);
  });

  it("de dagrem geldt ook voor de maaltijdmodule", () => {
    const maak = lees("lib/coaching/maaltijd.js");
    const stuk = maak.slice(maak.indexOf("export async function maakWeekmenu"));
    expect(stuk).toMatch(/magNog\(admin, gymId\)/);
    expect(stuk).toMatch(/boekVerbruik\(/);
  });

  it("een mijlpaal wordt maar één keer gevierd", () => {
    // Zonder de rij in coaching_mijlpalen viert een zondagcron elke zondag opnieuw "je eerste week".
    const m = lees("lib/coaching/mijlpalen.js");
    expect(m).toMatch(/coaching_mijlpalen/);
    const cron = lees("app/api/cron/coaching/route.js");
    expect(cron).toMatch(/markeerGemeld\(/);
  });

  it("een mislukt menu houdt de trainingsweek niet tegen", () => {
    // De training is de ruggengraat; voeding is een module ernaast.
    const cron = lees("app/api/cron/coaching/route.js");
    const stuk = cron.slice(cron.indexOf("if (maaltijdenAan(lid))"));
    expect(stuk.slice(0, 600)).toMatch(/try \{/);
  });

  it("de proefgroep-poort staat op elke ingang", () => {
    // Vijf plekken kunnen de AI-coach zichtbaar maken. Vergeet er één, en de functie lekt naar
    // 86 leden terwijl ze voor twee bedoeld is.
    for (const bestand of [
      "app/(site)/coaching/page.jsx",
      "app/(site)/coaching/actions.js",
      "app/(site)/account/page.jsx",
      "app/(site)/training/page.jsx",
      "app/api/cron/coaching/route.js",
    ]) {
      expect(lees(bestand), `${bestand} mist de poort`).toMatch(/magCoaching\(/);
    }
  });

  it("de poort zit in één plek voor alle server actions, niet per actie herhaald", () => {
    // Per actie herhalen is hem ooit vergeten. De controle hoort in ik().
    const a = lees("app/(site)/coaching/actions.js");
    const inIk = /async function ik\(\)[\s\S]{0,400}?magCoaching\(profile\)/.test(a);
    expect(inIk).toBe(true);
  });

  // ---- Wat de review van 10-09 boven water haalde. Elke test hieronder is een fout die er echt
  // ---- in zat en die zonder deze regel stilletjes terug kan komen.

  it("een vastgelopen plan blijft niet elke zondag dezelfde mail sturen", () => {
    // pauze_vragen en doorverwijzen openen geen nieuwe week. Zonder een eindpunt vond de cron de
    // week erna exact dezelfde toestand, en vertrok dezelfde mail — eindeloos.
    const p = lees("lib/coaching/plan.js");
    expect(p).toMatch(/alGevraagd[\s\S]{0,400}status: "gepauzeerd"/);
    expect(p).toMatch(/alGemeld[\s\S]{0,600}status: "gepauzeerd"/);
    expect(lees("app/api/cron/coaching/route.js")).toMatch(/uit\.gepauzeerd/);
  });

  it("de check-in staat er ook voor wie de week NIET afmaakte", () => {
    // De zondagmail vraagt juist aan wie niet alles afwerkte hoe het ging. Stond het formulier
    // alleen bij een perfecte week, dan kwam die persoon op een pagina zonder formulier.
    expect(lees("app/(site)/coaching/page.jsx")).toMatch(/magCheckin\s*=\s*alleAf\s*\|\|/);
    expect(lees("components/coaching/WeekPaneel.jsx")).toMatch(/\{magCheckin && !checkin &&/);
  });

  it("pijn vervangt alleen oefeningen op de gemelde plek", () => {
    // Eén weekbrede vlag verving ooit het VOLLEDIGE schema van de week erna.
    const p = lees("lib/coaching/plan.js");
    // Het sein PER OEFENING moet door raaktPijn lopen. De weekbrede vlag in weekBesluit mag blijven
    // — die bepaalt of de week lichter wordt, niet welke oefeningen sneuvelen.
    expect(p).toMatch(/seinen\[o\.id\] = \{[\s\S]{0,240}raaktPijn\(/);
  });

  it("een lichtere week is tijdelijk, niet permanent", () => {
    // Elke week wordt uit de vorige gebouwd. Een vaste factor 0,6 die niet teruggedraaid wordt,
    // blijft doorwerken tot er nog één set overblijft.
    expect(lees("lib/coaching/plan.js")).toMatch(/vorigDeel/);
  });

  it("inkorten laat geen sessiedag definitief vallen", () => {
    const p = lees("lib/coaching/plan.js");
    expect(p).not.toMatch(/dagenLijst\.slice\(0, dagenLijst\.length - 1\)/);
  });

  it("er blijft één actief programma per lid", () => {
    // De rest van de app gaat uit van precies één actief plan (RPC set_active_plan, 0062).
    expect(lees("lib/coaching/plan.js")).toMatch(/is_active: false/);
  });

  it("een coachingweek kan niet via /plannen weggegooid worden", () => {
    // De weken staan als gewone programs-rijen in die lijst; verwijderen sleept via de cascade de
    // coaching_sessions mee.
    expect(lees("app/(site)/plannen/actions.js")).toMatch(/coaching_weeks[\s\S]{0,200}program_id/);
  });

  it("de toestemming kan ingetrokken worden terwijl er een plan loopt", () => {
    // Art. 7.3 AVG: intrekken moet even makkelijk zijn als geven. De intakewizard verdwijnt zodra
    // er een plan draait, dus zonder dit scherm was er geen enkele weg meer.
    expect(lees("app/(site)/coaching/actions.js")).toMatch(/export async function zetToestemming/);
    expect(lees("components/coaching/PlanBeheer.jsx")).toMatch(/zetToestemming/);
    expect(lees("app/(site)/coaching/page.jsx")).toMatch(/<PlanBeheer/);
  });

  it("pauzeren en stoppen hebben een knop, want de mail belooft ze", () => {
    expect(lees("components/coaching/PlanBeheer.jsx")).toMatch(/zetPlanStatus/);
  });

  it("het geslacht wordt gevraagd \u00e9n bewaard", () => {
    // Zonder deze kolom rekende elk weekmenu met de laagste norm en was de ondergrens van 1.800
    // kcal voor mannen dode code.
    expect(lees("components/coaching/IntakeWizard.jsx")).toMatch(/GESLACHTEN/);
    expect(lees("app/(site)/coaching/actions.js")).toMatch(/velden\.geslacht = geslacht/);
  });

  it("een lid dat nog iets moet invullen laat de cron niet mislukken", () => {
    // "Meal plan aan, toestemming nog niet gegeven" is een normale toestand, geen storing.
    expect(lees("lib/coaching/maaltijd.js")).toMatch(/ontbreekt: true/);
    expect(lees("app/api/cron/coaching/route.js")).toMatch(/!m\.ontbreekt/);
  });

  it("het weekmenu kijkt niet over de plangrens heen", () => {
    expect(lees("lib/coaching/maaltijd.js")).toMatch(/if \(planId\) vraag = vraag\.eq\("plan_id", planId\)/);
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

describe("afvinken vanuit de deurcodemail", () => {
  // De verhuizing van deze ronde. Gemeten op 10-09-2026: 159 boekingen in dertig dagen tegenover
  // 20 rijen in `door_log` en zeven workout-logs ooit. De zaal kan niet afleiden dat je er was —
  // wie zijn keypadcode intypt laat geen spoor na — en de pagina met het vinkje wordt niet bezocht.
  // Deze mail heeft als enige 100% dekking, want zonder de code raak je niet binnen.

  it("bouwt het pad naar de afvinkpagina", () => {
    expect(afvinkPad("sessietoken0123")).toBe("/s/sessietoken0123");
  });

  it("ontsnapt de token, zodat een rare token de URL niet openbreekt", () => {
    expect(afvinkPad("a b&c")).toBe("/s/a%20b%26c");
  });

  it("geeft niets terug zonder token", () => {
    expect(afvinkPad(null)).toBeNull();
    expect(afvinkPad("")).toBeNull();
  });

  it("zet GEEN oordeel in de URL — de mail mag niet schrijven", () => {
    // De eerste versie droeg drie links `?v=goed|te_licht|te_zwaar` die tijdens het renderen
    // schreven. De verdediging was dat de mail vijf minuten vóór de sessie vertrekt en de actie
    // alles vóór `starts_at` weigert, dus dat een linkscanner altijd op die grens zou botsen.
    // Dat klopt niet: sendDueAccessCodes verstuurt in een venster dat tot zestien minuten NA de
    // start loopt, en bij een verplaatste boeking gaat de mail opnieuw uit.
    for (const o of AFVINK_OORDELEN) {
      expect(afvinkPad("sessietoken0123")).not.toContain(o.v);
    }
    expect(afvinkPad("sessietoken0123")).not.toContain("?");
  });

  it("de drie knoppen zijn precies de drie oordelen die de databank kent", () => {
    // coaching_sessions.oordeel heeft een check-constraint op deze drie (migratie 0157). Een vierde
    // knop zou een schrijfactie zijn die stilletjes faalt.
    expect(AFVINK_OORDELEN.map((o) => o.v)).toEqual(["te_licht", "goed", "te_zwaar"]);
  });

  it("de sleutel hangt aan de SESSIE en niet aan de boeking", () => {
    // Dit is de veiligheidseigenschap. Ze werd eerder verdedigd met "de knoppen staan binnen het
    // workoutblok en de coach krijgt geen workout" — een opmaakargument. Het echte lek zat elders:
    // coach en lid deelden `bookings.report_token`, dat óók in de meldpuntlink /m/{token} van de
    // coach staat. /m/ vervangen door /s/ volstond om de sessie van zijn client af te vinken.
    const l = lees("lib/coaching/levering.js");
    expect(l).toMatch(/afvink_token/);
    expect(l).toMatch(/afvinkToken,/);
    // en de mail leest hem uit de workout, niet uit het meldtoken
    expect(lees("lib/email.js")).toMatch(/workout\?\.afvinkToken/);
    expect(lees("lib/email.js")).not.toMatch(/afvinkPad\(reportToken/);
  });

  it("de workout passeert de proefgroep-poort", () => {
    // Deze mail was de enige ingang die `magCoaching` niet passeerde. Wie ooit een plan maakte toen
    // de lijst ruimer stond, kreeg zijn schema anders gewoon blijven toegestuurd.
    const l = lees("lib/coaching/levering.js");
    expect(l).toMatch(/import \{ magCoaching \}/);
    expect(l).toMatch(/if \(!magCoaching\(lid\)\) return null;/);
  });
});

describe("de landingspagina van het afvinken", () => {
  it("schrijft niets tijdens het renderen", () => {
    // De GET mag geen zij-effect hebben: een linkscanner of een prefetcher zou anders het oordeel
    // kiezen, en `?v=` bleef in de adresbalk staan zodat "vinkje weghalen" zichzelf terugzette.
    const pg = lees("app/s/[token]/page.jsx");
    expect(pg).not.toMatch(/vinkAfViaToken/);
    expect(pg).not.toMatch(/searchParams/);
  });

  it("weigert alles vóór de sessie begonnen is", () => {
    const a = lees("app/s/[token]/actions.js");
    expect(a).toMatch(/if \(!d\.begonnen\) return \{ error/);
    expect(a).toMatch(/begonnen: Date\.now\(\) >= new Date\(boeking\.starts_at\)/);
  });

  it("de link sterft 96 uur na de sessie — zelfde venster als /f en het meldpunt", () => {
    expect(lees("app/s/[token]/actions.js")).toMatch(/VENSTER_NA = 96 \* 3600000/);
  });

  it("resolvet op het sessietoken, niet op het meldtoken van de boeking", () => {
    const a = lees("app/s/[token]/actions.js");
    expect(a).toMatch(/eq\("afvink_token", t\)/);
    expect(a).not.toMatch(/eq\("report_token"/);
  });

  it("controleert dat de boeking bevestigd is", () => {
    expect(lees("app/s/[token]/actions.js")).toMatch(/boeking\.status !== "bevestigd"/);
  });

  it("laat de proefgroep-poort ook hier gelden", () => {
    expect(lees("app/s/[token]/actions.js")).toMatch(/magCoaching\(lid\)/);
  });

  it("de pagina staat niet in Google", () => {
    expect(lees("app/s/[token]/page.jsx")).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});
