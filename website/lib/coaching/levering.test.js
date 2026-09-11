import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { oefeningRegel, workoutKop, afvinkPad, AFVINK_OORDELEN } from "./levering.js";
import { toonLaadhint, laadhint } from "./voorschrift.js";

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
    // De admin-client komt uit wie.js, samen met de toegangspoort: wie langs de poort mag, krijgt
    // de sleutel. Ze los van elkaar kunnen krijgen is precies de fout die je niet wil kunnen maken.
    expect(lees("lib/coaching/wie.js")).toMatch(/admin: createAdminClient\(\)/);
    expect(lees("app/(site)/coaching/actions.js")).toMatch(/mij\.admin\./);
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

  it("de dagrem geldt ook voor de maaltijdmodule, en een weigering laat een spoor na", () => {
    const maak = lees("lib/coaching/maaltijd.js");
    const stuk = maak.slice(maak.indexOf("export async function maakWeekmenu"));
    // `magNogOfBoek` in plaats van `magNog`: de rem werkte al, maar hij zweeg. Het commentaar
    // bovenaan budget.js belooft sinds dag één "een melding in het logboek zodat de eigenaar weet
    // dat hij hem moet verhogen" — en die melding bestond niet, want magNog staat vóór
    // boekVerbruik en een geweigerde aanroep liet dus precies niets na.
    expect(stuk).toMatch(/magNogOfBoek\(admin, \{ gymId, memberId, soort: "menu" \}\)/);
    expect(stuk).toMatch(/boekVerbruik\(/);
    // En de duurste aanroep van het systeem moet vertellen of er iets uitkwam.
    expect(stuk).toMatch(/boekResultaat\(admin, boeking\.id, "menu_geschreven"\)/);
  });

  it("elke modelaanroep boekt wat eruit KWAM, niet alleen dat de gateway antwoordde", () => {
    // Op productie stonden drie plan-aanroepen op ok=true, samen 98.460 micro-USD, tegenover één
    // plan. 72% van het geld ging naar niets, en de beheerpagina toonde "Mislukt: 0". `ok` betekent
    // alleen "er kwam tekst terug" — het boeken gebeurt vóór lezen, keuren en opslaan. Zie 0161.
    const p = lees("lib/coaching/plan.js");
    for (const uitkomst of ["gateway_faalde", "json_onleesbaar", "geen_oefeningen", "afgekeurd", "opslag_faalde", "plan_geschreven", "zin_geschreven"]) {
      expect(p).toContain(`"${uitkomst}"`);
    }
    expect(lees("lib/coaching/budget.js")).toMatch(/export async function boekResultaat/);
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
    // Zes plekken kunnen de AI-coach zichtbaar maken of laten werken. Vergeet er één, en de functie
    // lekt naar 86 leden terwijl ze voor twee bedoeld is.
    for (const bestand of [
      "app/(site)/coaching/page.jsx",
      "app/(site)/account/page.jsx",
      "app/(site)/training/page.jsx",
      "app/api/cron/coaching/route.js",
    ]) {
      expect(lees(bestand), `${bestand} mist de poort`).toMatch(/magCoaching\(/);
    }
    // De twee SCHRIJFingangen — de serveracties en de stroomroute — doen het niet zelf maar via
    // wie.js. Dat is met opzet: zie de volgende test.
    for (const bestand of ["app/(site)/coaching/actions.js", "app/api/coaching/stroom/route.js"]) {
      expect(lees(bestand), `${bestand} gaat niet via wie.js`).toMatch(/from "@\/lib\/coaching\/wie\.js"/);
    }
  });

  it("de poort zit in één plek, niet per actie en niet per ingang herhaald", () => {
    // Per actie herhalen is hem ooit vergeten. Sinds er een tweede ingang bij kwam (de stroomroute,
    // die exact hetzelfde werk doet mét meekijker) geldt datzelfde tussen bestanden.
    expect(lees("lib/coaching/wie.js")).toMatch(/export async function wie\(\)[\s\S]{0,400}?magCoaching\(profile\)/);
    // En niemand bouwt zijn eigen versie: wie zelf `getSessionProfile` ophaalt, kan `magCoaching`
    // vergeten zonder dat iets het merkt.
    for (const bestand of ["app/(site)/coaching/actions.js", "app/api/coaching/stroom/route.js", "lib/coaching/opdracht.js"]) {
      expect(lees(bestand), `${bestand} bouwt zijn eigen poort`).not.toMatch(/getSessionProfile\(/);
    }
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

  it("er blijft één actief programma per lid — ook bij een NIEUW plan", () => {
    // De rest van de app gaat uit van precies één actief plan (RPC set_active_plan, 0062).
    // `openVolgendeWeek` regelde dit al bij elke weekovergang, maar `maakPlan` niet — en dat is
    // juist het meest voorkomende geval: een tweede plan starten nadat het eerste gestopt is.
    // Dan stonden er twee actieve programma's en schreef "+ in mijn schema" in het verkeerde.
    const p = lees("lib/coaching/plan.js");
    const maak = p.slice(p.indexOf("export async function maakPlan"), p.indexOf("export async function geschiedenisVanPlan"));
    expect(maak).toMatch(/is_active: false/);
    expect(maak).toMatch(/\.neq\("id", programId\)/);
    // en de weekovergang blijft het ook doen
    expect(p.slice(p.indexOf("export async function openVolgendeWeek"))).toMatch(/is_active: false/);
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

describe("wachten op de coach", () => {
  // Gemeten op 11-09-2026: de gateway STREAMT wél. Met `stream: true` komt de eerste tekst na
  // 1.596 ms; zonder komt alles na het volledige antwoord (27-50 s). De eerdere conclusie hier —
  // "er valt niets door te sturen" — was gemeten zonder die vlag en dus fout. Daarop stond een
  // heel wachtscherm gebouwd dat niets kon tonen omdat er niets binnenkwam.

  it("de stroomroute houdt het werk in leven als het tabblad weggaat", () => {
    // DIT is wat "je mag wegklikken" waar maakt. Zonder after() stopt het werk zodra de verbinding
    // wegvalt, en dan is de belofte op het scherm een leugen.
    const r = lees("app/api/coaching/stroom/route.js");
    expect(r).toMatch(/import \{ after \} from "next\/server"/);
    expect(r).toMatch(/after\(werk\)/);
    // En ze mag lang genoeg duren; anders wordt ze halverwege afgekapt.
    expect(r).toMatch(/export const maxDuration = 300;/);
  });

  it("de route heeft geen eigen kopie van de toegangspoort", () => {
    // Twee ingangen naar hetzelfde werk is precies hoe voorwaarden uit elkaar gaan lopen.
    const r = lees("app/api/coaching/stroom/route.js");
    expect(r).toMatch(/from "@\/lib\/coaching\/wie\.js"/);
    expect(r).toMatch(/from "@\/lib\/coaching\/opdracht\.js"/);
    // En de serveracties gebruiken diezelfde poort.
    expect(lees("app/(site)/coaching/actions.js")).toMatch(/wie as ik/);
  });

  it("het wachtscherm verzint geen percentage", () => {
    // De eerste versie telde uit tot 10,2 seconden en bleef daarna op 88% staan, met stap 4 aan het
    // draaien terwijl in werkelijkheid het model nog schreef. Een balk die stilstaat leest als
    // "het hangt", en een stap die draait terwijl een andere bezig is, is gewoon onwaar.
    const b = lees("components/coaching/Voortgang.jsx");
    expect(b).not.toMatch(/const DUUR/);
    expect(b).not.toMatch(/%`/);
  });

  it("de stappen komen van de server, niet van een timer", () => {
    const b = lees("components/coaching/Voortgang.jsx");
    expect(b).not.toMatch(/setTimeout/);
    // De huidige stap wordt uit de gemelde sleutel afgeleid.
    expect(b).toMatch(/s\.sleutel === stap\?\.sleutel/);
    // En die sleutels worden ook echt gemeld, aan allebei de kanten van het werk.
    expect(lees("lib/coaching/plan.js")).toMatch(/sleutel: "oefeningen"/);
    expect(lees("lib/coaching/maaltijd.js")).toMatch(/sleutel: "wegschrijven"/);
  });

  it("toont het enige getal dat wél waar is: de verstreken tijd", () => {
    const b = lees("components/coaching/Voortgang.jsx");
    expect(b).toMatch(/\{seconden\}s bezig/);
    // En de teller start ná de hydratatie — de klok tijdens het renderen gaf hier ooit fout #418.
    expect(b).toMatch(/useEffect\(\(\) => \{[\s\S]{0,120}setInterval/);
  });

  it("zegt nu dat je WEL mag wegklikken, want dat klopt nu", () => {
    const b = lees("components/coaching/Voortgang.jsx");
    expect(b).toMatch(/mag gerust wegklikken/);
    expect(b).not.toMatch(/Laat dit scherm openstaan/);
  });

  it("een weggevallen verbinding is geen mislukte opdracht — maar alleen als ze aankwam", () => {
    // Het verschil tussen "er wordt gewerkt, je mag wegklikken" en "er is niets gestart". Zonder
    // dat onderscheid geeft een mislukte fetch hetzelfde geruststellende scherm, en dat is dan een
    // leugen tegen iemand die staat te wachten op iets dat nooit begonnen is.
    const h = lees("components/coaching/stroom.js");
    expect(h).toMatch(/begonnen = true/);
    expect(h).toMatch(/begonnen\s*\?\s*\{ losgekoppeld: true \}/);
  });

  it("het menu deelt hetzelfde scherm — het is de traagste aanroep van allemaal", () => {
    const m = lees("components/coaching/MaaltijdPaneel.jsx");
    expect(m).toMatch(/<Voortgang wat="menu"/);
    expect(m).not.toMatch(/Je menu wordt samengesteld/);
  });

  it("streamen gebeurt alleen wanneer er iemand meekijkt, en nooit met gereedschap", () => {
    // Bij gereedschap komen de brokken als `input_json_delta`: half afgemaakte argumenten waar
    // niets leesbaars in zit. En de zondagcron geeft geen meekijker mee, dus die verandert niet.
    const m = lees("lib/coaching/model.js");
    expect(m).toMatch(/const stroom = typeof onDelta === "function" && !tools\?\.length;/);
    expect(m).toMatch(/\.\.\.\(stroom \? \{ stream: true \} : \{\}\)/);
  });

  it("de coachingroute verklaart hoe lang ze mag duren", () => {
    // Zonder maxDuration hangt een aanroep van 27-41 seconden aan een platformstandaard die nergens
    // in de code te zien is. Is die korter, dan wordt het plan halverwege afgekapt — en dan blijft
    // er een plan zonder geopende week achter.
    expect(lees("app/(site)/coaching/page.jsx")).toMatch(/export const maxDuration = 300;/);
  });

  it("een half geschreven plan heeft een uitweg", () => {
    // De zes schrijfacties van maakPlan staan niet in één transactie. Valt het ertussenin stil, dan
    // bestaat er een plan zonder geopende week: de cron slaat het over (`if (!open) continue`) en
    // een nieuw plan wordt geweigerd. Daar stond "Ververs deze pagina zo dadelijk", wat niet helpt.
    const p = lees("app/(site)/coaching/page.jsx")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(p).toMatch(/halverwege blijven steken/);
    expect(p).not.toMatch(/Ververs deze pagina zo dadelijk/);
  });

  it("een exceptie tijdens het maken laat het scherm niet eeuwig draaien", () => {
    // maakPlan gooit op vier plekken; de route vangt dat op en stuurt een foutbericht.
    expect(lees("app/api/coaching/stroom/route.js")).toMatch(/\.catch\(\(e\) => \{[\s\S]{0,300}t: "fout"/);
    // En de wizard vangt het bewaren van de antwoorden apart op.
    expect(lees("components/coaching/IntakeWizard.jsx")).toMatch(/catch \(e\) \{[\s\S]{0,200}setMaken\(false\)/);
  });
});

describe("hoe zwaar moet dit zijn", () => {
  // Een AI-plan heeft geen streefgewichten: het model weet niet hoe sterk dit lid is, en het lid
  // vult nergens een getal in (bewust — zeven workout-logs ooit over 86 leden). Het lid las dus
  // "Barbell Squat — 4×8" zonder te weten wat er op de stang moest.

  it("alleen bij de hoofdoefening, en alleen zonder gewicht", () => {
    expect(toonLaadhint("Hoofdoefening", null)).toBe(true);
    expect(toonLaadhint("Hoofdoefening", 60)).toBe(false);   // staat er al een gewicht
    expect(toonLaadhint("Accessoire", null)).toBe(false);    // anders wordt het behang
    expect(toonLaadhint("Warming-up", null)).toBe(false);
  });

  it("wie nog nooit trainde, krijgt ook een vertrekpunt", () => {
    expect(laadhint("nooit")).toMatch(/begin licht/i);
    expect(laadhint("vaak")).not.toMatch(/begin licht/i);
    // Maar allebei zeggen ze hetzelfde over hoe je het gewicht kiest.
    for (const e of ["nooit", "soms", "vaak"]) {
      expect(laadhint(e)).toMatch(/laatste twee herhalingen/);
    }
  });

  it("de app en de mail zeggen exact hetzelfde", () => {
    // Eén bron, anders lopen ze uit elkaar zodra iemand er één bijstelt.
    expect(lees("components/coaching/WeekPaneel.jsx")).toMatch(/laadhint\(ervaring\)/);
    expect(lees("lib/email.js")).toMatch(/laadhint\(workout\.ervaring\)/);
  });
});
