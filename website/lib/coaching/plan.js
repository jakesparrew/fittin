// De orkestratie: van een intake naar een plan, en van een afgelopen week naar de volgende.
//
// Dit is de enige laag die zowel het model als de databank aanraakt. De lagen eronder blijven puur:
// progressie.js rekent, keuze.js kiest, prompt.js bouwt tekst. Hier komt het samen.
//
// Waar het model wél en niet aan te pas komt:
//   maakPlan()          — één keer per plan. Het model bedenkt de structuur en schrijft de
//                         samenvatting. Duurste aanroep van het hele systeem, en de enige die
//                         echt nadenkwerk is.
//   openVolgendeWeek()  — GEEN model voor het rekenwerk. De progressie komt uit progressie.js en
//                         de oefeningen uit keuze.js. Alleen de zin die het lid leest, komt van
//                         het goedkope model — en als dat faalt, valt er een geschreven zin in de
//                         plaats. Een week gaat nooit niet open omdat een model stilviel.
//   herplan()           — alleen bij pijn of drie weken te zwaar. Dat is een keuze, geen som.

import { roepMetTerugval, MODELLEN } from "./model.js";
import { magNogOfBoek, boekVerbruik, boekResultaat } from "./budget.js";
import { bouwContext, planSysteem, planVraag, analyseSysteem, analyseVraag, herplanSysteem } from "./prompt.js";
import { kiesOefeningen, verdeelFocus, keurVoorschriften } from "./keuze.js";
import { wekenOpRij } from "./mijlpalen.js";
import { volgendeWeek, isRustweek, RUSTWEEK_DEEL, reeksAanHetEind, raaktPijn, noemtEenPlek, dempOordeel, uitgeput } from "./progressie.js";

/**
 * JSON uit een modelantwoord halen. Modellen zetten er soms een codeblok of een zin omheen, ook
 * als je erom vraagt dat niet te doen. Liever hier opvangen dan een lid een foutmelding tonen.
 */
export function leesJson(tekst) {
  if (!tekst) return null;
  let t = String(tekst).trim();
  const blok = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (blok) t = blok[1].trim();
  const eerste = t.indexOf("{");
  const laatste = t.lastIndexOf("}");
  if (eerste === -1 || laatste <= eerste) return null;
  try { return JSON.parse(t.slice(eerste, laatste + 1)); } catch { return null; }
}

/** Blokken uit een modelantwoord opschonen: alleen wat we kennen, binnen redelijke grenzen. */
export function schoonBlokken(blokken) {
  const SECTIES = ["Warming-up", "Hoofdoefening", "Accessoire", "Finisher"];
  return (Array.isArray(blokken) ? blokken : []).slice(0, 8).map((b) => ({
    categorie: typeof b?.categorie === "string" ? b.categorie.toLowerCase().trim() : null,
    mechanic: b?.mechanic === "compound" || b?.mechanic === "isolation" ? b.mechanic : null,
    sectie: SECTIES.includes(b?.sectie) ? b.sectie : "Hoofdoefening",
    sets: Math.min(8, Math.max(1, parseInt(b?.sets, 10) || 3)),
    reps: Math.min(50, Math.max(1, parseInt(b?.reps, 10) || 10)),
    rust: Math.min(300, Math.max(30, parseInt(b?.rust, 10) || 90)),
  })).filter((b) => b.categorie);
}

/** Alle actieve oefeningen van de gym, als keuzelijst voor keuze.js. */
async function bibliotheekVan(admin, gymId) {
  const { data, error } = await admin
    .from("exercises")
    .select("id, name, category, difficulty, equipment, mechanic, force, animation_url, image_url, instructions")
    .eq("gym_id", gymId)
    .limit(2000);
  if (error) throw new Error(`oefeningen niet op te halen: ${error.message}`);
  return data || [];
}

/**
 * Schrijft één week weg als programma met dagen en oefeningen.
 * @returns {string} program_id
 */
async function schrijfWeekProgramma(admin, { gymId, memberId, planNaam, weeknummer, sessies }) {
  const { data: prog, error: pe } = await admin.from("programs").insert({
    gym_id: gymId,
    member_id: memberId,
    name: `${planNaam} — week ${weeknummer}`,
    is_template: false,
    is_active: true,
  }).select("id").single();
  if (pe) throw new Error(`week niet aan te maken: ${pe.message}`);

  const dagIds = [];
  for (const [i, sessie] of sessies.entries()) {
    const { data: dag, error: de } = await admin.from("program_days").insert({
      program_id: prog.id,
      day_no: i + 1,
      name: sessie.naam || `Sessie ${i + 1}`,
    }).select("id").single();
    if (de) throw new Error(`sessie niet aan te maken: ${de.message}`);
    dagIds.push(dag.id);

    const rijen = sessie.oefeningen.map((o, j) => ({
      program_day_id: dag.id,
      exercise_id: o.exercise_id,
      sets: o.sets,
      reps: o.reps,
      rest_sec: o.rust,
      position: j,
      section: o.sectie,
      target_weight_kg: o.target_weight_kg ?? null,
    }));
    if (rijen.length) {
      const { error: oe } = await admin.from("program_exercises").insert(rijen);
      if (oe) throw new Error(`oefeningen niet aan te maken: ${oe.message}`);
    }
  }
  return { programId: prog.id, dagIds };
}

/** Zet de sessie-rijen die het lid gaat afvinken. */
async function schrijfSessies(admin, { gymId, weekId, dagIds }) {
  const rijen = dagIds.map((id, i) => ({ gym_id: gymId, week_id: weekId, program_day_id: id, volgnummer: i + 1 }));
  const { error } = await admin.from("coaching_sessions").insert(rijen);
  if (error) throw new Error(`sessies niet aan te maken: ${error.message}`);
}

/**
 * Een volledig nieuw plan. Dit is de enige plek waar het slimme model werk doet.
 */
export async function maakPlan(admin, { gymId, memberId, profiel, weken, sessiesPerWeek }) {
  const rem = await magNogOfBoek(admin, { gymId, memberId, soort: "plan" });
  if (!rem.mag) return { error: `De coach kan nu even geen plan maken (${rem.reden}). Probeer het morgen opnieuw.` };

  const context = bouwContext(profiel);
  const uit = await roepMetTerugval({
    model: MODELLEN.plan,
    system: planSysteem(),
    messages: [{ role: "user", content: planVraag(context, { weken, sessiesPerWeek }) }],
    maxTokens: 4000,
    temperatuur: 0.4,
  });
  // De tokens zijn nu betaald. Wat er UITKWAM weten we pas na lezen, keuren en opslaan — daarom
  // krijgt elke uitgang hieronder zijn eigen `boekResultaat`. Zonder dat stond 72% van alles wat de
  // coach ooit kostte als "geslaagd" in de boeken terwijl er niets uitkwam. Zie 0161.
  const boeking = await boekVerbruik(admin, { gymId, memberId, soort: "plan", uitkomst: uit });
  if (!uit.ok) {
    await boekResultaat(admin, boeking.id, uit.configuratieFout ? "sleutel_ongeldig" : "gateway_faalde");
    // Eerlijk blijven over wat het lid kan doen. Bij een sleutelprobleem helpt opnieuw proberen niet.
    return {
      error: uit.configuratieFout
        ? "Je coach is tijdelijk onbereikbaar. Dit ligt aan ons, niet aan jou — we zijn verwittigd en zetten het zo recht."
        : "De coach kon geen plan opstellen. Probeer het zo dadelijk opnieuw.",
    };
  }

  const json = leesJson(uit.tekst);
  if (!json?.week1?.sessies?.length) {
    await boekResultaat(admin, boeking.id, "json_onleesbaar");
    return { error: "De coach gaf een onbruikbaar plan terug. Probeer het opnieuw." };
  }

  const bibliotheek = await bibliotheekVan(admin, gymId);
  const geldigeIds = new Set(bibliotheek.map((b) => b.id));
  const niveau = profiel.coaching_ervaring || "soms";
  const planNaam = "Coaching";

  // Week 1 invullen. Het model gaf plekken; wij zetten er echte oefeningen in.
  const vangnet = verdeelFocus(sessiesPerWeek);
  const gebruikt = [];
  const sessies = (json.week1.sessies || []).slice(0, 7).map((s, i) => {
    let blokken = schoonBlokken(s.blokken);
    if (!blokken.length) {
      // Het model gaf niets bruikbaars voor deze sessie — dan het vangnet, zodat het lid nooit
      // een lege sessie krijgt.
      blokken = (vangnet[i] || vangnet[0]).map((cat, j) => ({
        categorie: cat, mechanic: j === 0 ? "compound" : null, sectie: j === 0 ? "Hoofdoefening" : "Accessoire",
        sets: 3, reps: 10, rust: 90,
      }));
    }
    const { gekozen } = kiesOefeningen(blokken, bibliotheek, { niveau, vermijd: gebruikt, zaad: `${memberId}|w1|${i}` });
    gekozen.forEach((g) => gebruikt.push(g.exercise_id));
    return { naam: typeof s.naam === "string" ? s.naam.slice(0, 60) : `Sessie ${i + 1}`, oefeningen: gekozen };
  }).filter((s) => s.oefeningen.length);

  if (!sessies.length) {
    await boekResultaat(admin, boeking.id, "geen_oefeningen");
    return { error: "Er konden geen oefeningen gevonden worden voor dit plan." };
  }
  const keuring = keurVoorschriften(sessies.flatMap((s) => s.oefeningen), geldigeIds);
  if (!keuring.ok) {
    console.error("coaching: voorschriften afgekeurd", keuring.fout.slice(0, 3));
    await boekResultaat(admin, boeking.id, "afgekeurd");
    return { error: "De coach kon het plan niet controleren. Probeer het opnieuw." };
  }

  // Pas nu wegschrijven — een half plan in de databank is erger dan geen plan.
  const { data: plan, error: pe } = await admin.from("coaching_plans").insert({
    gym_id: gymId,
    member_id: memberId,
    doel: profiel.coaching_doel || "bewegen",
    weken,
    sessies_per_week: sessiesPerWeek,
    samenvatting: typeof json.samenvatting === "string" ? json.samenvatting.slice(0, 1200) : null,
  }).select("id").single();
  if (pe) {
    await boekResultaat(admin, boeking.id, "opslag_faalde");
    if (pe.code === "23505") return { error: "Je hebt al een lopend plan." };
    return { error: `Het plan kon niet bewaard worden: ${pe.message}` };
  }

  // Alle weken als rij, maar alleen week 1 met inhoud. De rest is schets tot ze opengaat — anders
  // kan week 6 nooit rekening houden met wat er in week 4 gebeurde.
  const schets = Array.isArray(json.weken) ? json.weken : [];
  const weekRijen = Array.from({ length: weken }, (_, i) => ({
    gym_id: gymId,
    plan_id: plan.id,
    weeknummer: i + 1,
    // Week 1 krijgt de geschreven zin; de latere weken de focus uit de schets van het model, tot
    // ze opengaan en een echte analyse krijgen.
    weekanalyse: i === 0
      // `sessies.length`, niet `sessiesPerWeek`. Het model kan voor een dag niets bruikbaars geven
      // en dan valt die sessie weg (zie de filter hierboven). De eerste zin die het lid van zijn
      // coach leest, hoort het aantal te noemen dat er ook echt staat.
      ? eersteWeekZin({ sessiesPerWeek: sessies.length, toon: profiel.coaching_toon })
      : (schets.find((w) => Number(w?.nr) === i + 1)?.focus || null),
    is_rustweek: isRustweek(i + 1, weken),
  }));
  const { data: weken1, error: we } = await admin.from("coaching_weeks").insert(weekRijen).select("id, weeknummer");
  if (we) return { error: `De weken konden niet bewaard worden: ${we.message}` };

  const week1 = weken1.find((w) => w.weeknummer === 1);
  const { programId, dagIds } = await schrijfWeekProgramma(admin, { gymId, memberId, planNaam, weeknummer: 1, sessies });
  // De rest van de app gaat uit van precies ÉÉN actief programma per lid (RPC set_active_plan,
  // 0062). `schrijfWeekProgramma` zet het nieuwe op actief, dus alles wat er al actief stond moet
  // eruit — anders schrijft "+ in mijn schema" vanaf nu in het verkeerde programma.
  //
  // `openVolgendeWeek` deed dit al bij elke weekovergang; hier ontbrak het, waardoor precies het
  // meest voorkomende geval het gat had: een tweede plan starten nadat het eerste gestopt is.
  // Gemeten toen dat gebeurde: twee actieve programma's, met de hand rechtgezet.
  await admin.from("programs").update({ is_active: false })
    .eq("member_id", memberId).eq("is_active", true).neq("id", programId);
  await admin.from("coaching_weeks").update({ program_id: programId, unlocked_at: new Date().toISOString() }).eq("id", week1.id);
  await schrijfSessies(admin, { gymId, weekId: week1.id, dagIds });

  await boekResultaat(admin, boeking.id, "plan_geschreven");
  return { ok: true, planId: plan.id, weekId: week1.id, kostMicro: uit.kostMicro };
}

/**
 * De geschiedenis van dit plan, per oefening. Twee dingen die de opvolging nodig heeft en die tot
 * nu ontbraken — beide stonden als bekend gat in de review van 10-09.
 *
 *   reeksGoed  — hoe vaak op rij het lid "goed" tikte voor de sessie waar deze oefening in zat.
 *                Stond hard op 0, waardoor de regel "drie keer goed = toch een duwtje" nooit vuurde
 *                en iemand die het altijd goed vond, acht weken lang exact hetzelfde deed.
 *   startReps  — de herhalingen waarmee DEZE OEFENING begon: de eerste week waarin ze voorkomt.
 *                Werd ingevuld met de reps van de LOPENDE week, waardoor de bovengrens (start + 4)
 *                elke week mee opschoof en de band die kracht van uithouding scheidt, niet bestond.
 *
 * Vier batchvragen voor het hele plan, niet per week — een plan van twaalf weken zou anders
 * zesendertig heen-en-weers kosten in een cron met een tijdsbudget.
 *
 * @param {object[]} weken   alle weekrijen van het plan, op weeknummer gesorteerd
 * @param {number} totEnMet  weeknummer van de laatst afgelopen week
 */
export async function geschiedenisVanPlan(admin, { weken, totEnMet }) {
  const leeg = { reeksGoedPer: new Map(), startRepsPer: new Map() };
  const relevant = (weken || []).filter((w) => w.program_id && w.weeknummer <= totEnMet);
  if (!relevant.length) return leeg;

  const progIds = relevant.map((w) => w.program_id);
  const { data: dagen } = await admin.from("program_days")
    .select("id, program_id, day_no").in("program_id", progIds).order("day_no");
  const dagIds = (dagen || []).map((d) => d.id);
  if (!dagIds.length) return leeg;

  const [{ data: oefeningen }, { data: sessies }] = await Promise.all([
    // De volgorde staat vast. Zonder `.order()` bepaalt Postgres de rijvolgorde, en die verschuift
    // zodra rijen bijgewerkt worden — dan gaf dezelfde databank op twee momenten een ander schema.
    admin.from("program_exercises").select("id, program_day_id, exercise_id, reps")
      .in("program_day_id", dagIds).order("program_day_id").order("position"),
    admin.from("coaching_sessions").select("week_id, program_day_id, oordeel")
      .in("week_id", relevant.map((w) => w.id)),
  ]);

  // Het oordeel hangt aan de SESSIE (een trainingsdag), de progressie aan de OEFENING. De brug is
  // program_day_id: elke oefening van die dag erft het oordeel dat het lid voor die dag gaf.
  const oordeelPerDag = new Map((sessies || []).map((s) => [s.program_day_id, s.oordeel]));
  const weekVanProgram = new Map(relevant.map((w) => [w.program_id, w.weeknummer]));
  const dagNaarWeek = new Map((dagen || []).map((d) => [d.id, weekVanProgram.get(d.program_id)]));

  // Dezelfde oefening kan twee keer in één week staan — het lid mag zelf oefeningen aan het actieve
  // programma toevoegen, en dat programma IS de coachingweek. Dan botsen twee oordelen op één
  // (oefening, week). Het STRENGSTE wint: wie ergens die week "te zwaar" tikte, hoort volgende week
  // niet zwaarder te krijgen omdat dezelfde oefening elders "goed" was.
  const STRENGHEID = { te_zwaar: 0, goed: 1, te_licht: 2 };
  const strengste = (a, b) => {
    if (a === undefined) return b;
    if (b === undefined || b === null) return a;
    if (a === null) return b;
    return STRENGHEID[b] < STRENGHEID[a] ? b : a;
  };

  const perOefening = new Map();
  const startReps = new Map();   // exercise_id -> { week, reps }
  for (const o of oefeningen || []) {
    const week = dagNaarWeek.get(o.program_day_id);
    if (!week) continue;

    // Het startpunt is de EERSTE week waarin deze oefening voorkomt, niet week 1. Een oefening die
    // pas later verschijnt — na een pijn-vervanging, of omdat het lid ze zelf toevoegde — had
    // anders geen anker, en dan viel de band terug op "de reps van deze week" en schoof het
    // repplafond alsnog elke week mee. Precies de bug die deze functie moest dichten.
    const huidig = startReps.get(o.exercise_id);
    if (Number.isFinite(o.reps) && (!huidig || week < huidig.week || (week === huidig.week && o.reps < huidig.reps))) {
      startReps.set(o.exercise_id, { week, reps: o.reps });
    }

    if (!perOefening.has(o.exercise_id)) perOefening.set(o.exercise_id, new Map());
    const perWeek = perOefening.get(o.exercise_id);
    perWeek.set(week, strengste(perWeek.get(week), oordeelPerDag.get(o.program_day_id) ?? null));
  }

  // De reeks telt over ALLE weken van het plan tot nu, niet alleen over de weken waarin de oefening
  // toevallig voorkwam. Een week waarin ze er niet was, is geen "goed" — hij breekt de reeks.
  // Zonder deze stap plakte de teller de weken ervoor en erna aan elkaar, en kreeg iemand die zijn
  // squat een week uit zijn schema haalde toch het duwtje voor drie weken op rij.
  const weeknummers = relevant.map((w) => w.weeknummer).sort((a, b) => a - b);
  const reeksGoedPer = new Map();
  for (const [exerciseId, perWeek] of perOefening) {
    const opVolgorde = weeknummers.map((n) => (perWeek.has(n) ? perWeek.get(n) : null));
    reeksGoedPer.set(exerciseId, reeksAanHetEind(opVolgorde, "goed"));
  }
  return {
    reeksGoedPer,
    startRepsPer: new Map([...startReps].map(([id, v]) => [id, v.reps])),
  };
}

/**
 * De volgende week openen. Doet het rekenwerk ZONDER model; alleen de zin komt van het goedkope
 * model, en als die faalt schrijven we er zelf een.
 */
export async function openVolgendeWeek(admin, { gymId, planId }) {
  const { data: plan } = await admin.from("coaching_plans").select("*").eq("id", planId).maybeSingle();
  if (!plan || plan.status !== "lopend") return { error: "Geen lopend plan." };

  const { data: weken } = await admin.from("coaching_weeks").select("*").eq("plan_id", planId).order("weeknummer");
  const huidige = [...(weken || [])].reverse().find((w) => w.unlocked_at);
  if (!huidige) return { error: "Er is nog geen week geopend." };
  const volgende = (weken || []).find((w) => w.weeknummer === huidige.weeknummer + 1);
  if (!volgende) {
    // De laatste week. Zonder deze afsluiting blijft een plan eeuwig "lopend" en blijft de zondagcron
    // er elke week over nadenken — en krijgt het lid nooit te horen dat het rond is.
    const nu = new Date().toISOString();
    if (!huidige.completed_at) await admin.from("coaching_weeks").update({ completed_at: nu }).eq("id", huidige.id);
    await admin.from("coaching_plans").update({ status: "afgerond", afgerond_at: nu }).eq("id", planId);
    return { ok: true, klaar: true };
  }
  if (volgende.unlocked_at) return { ok: true, alGeopend: true };

  // Wat gebeurde er de afgelopen week?
  const { data: sessies } = await admin.from("coaching_sessions").select("*").eq("week_id", huidige.id);
  const { data: checkin } = await admin.from("coaching_checkins").select("*").eq("week_id", huidige.id).maybeSingle();
  const gepland = (sessies || []).length;
  const afgevinkt = (sessies || []).filter((s) => s.gedaan_at).length;

  // Hoeveel weken op rij "te zwaar"? Dat is een doorverwijssignaal, geen progressiesignaal.
  const { data: eerdere } = await admin.from("coaching_checkins")
    .select("zwaarte, week_id").in("week_id", (weken || []).map((w) => w.id));
  const opVolgorde = (weken || []).map((w) => (eerdere || []).find((c) => c.week_id === w.id)?.zwaarte).filter(Boolean);
  const teZwaarWeken = reeksAanHetEind(opVolgorde, "te_zwaar");

  // Het voorschrift van de afgelopen week ophalen in neutrale vorm.
  const { data: dagen } = await admin.from("program_days").select("id, day_no, name").eq("program_id", huidige.program_id).order("day_no");
  const dagIds = (dagen || []).map((d) => d.id);
  const { data: oefeningen } = await admin.from("program_exercises")
    .select("id, program_day_id, exercise_id, sets, reps, rest_sec, position, section, rep_text, target_weight_kg")
    .in("program_day_id", dagIds.length ? dagIds : ["00000000-0000-0000-0000-000000000000"]);

  // Hoeveel weken op rij pijn? Eén keer pijn vervangt een oefening; drie keer hoort naar een mens.
  const { data: pijnRijen } = await admin.from("coaching_checkins")
    .select("pijn, week_id").in("week_id", (weken || []).map((w) => w.id));
  const pijnOpVolgorde = (weken || [])
    .map((w) => (pijnRijen || []).find((c) => c.week_id === w.id))
    .filter((c) => c !== undefined)
    .map((c) => (c?.pijn ? "pijn" : "geen"));
  const pijnWeken = reeksAanHetEind(pijnOpVolgorde, "pijn");

  // De bibliotheek staat hier al klaar omdat de seinen de CATEGORIE van elke oefening nodig hebben:
  // zonder die categorie kan pijn niet aan een plek gekoppeld worden en verving één vinkje het hele
  // schema.
  const bib = await bibliotheekVan(admin, gymId);
  const bibOp = new Map(bib.map((b) => [b.id, b]));

  // Vervangen doen we alleen als het lid een herkenbare plek noemde. Noemt hij niets — of iets wat
  // we niet kunnen plaatsen — dan blijft het schema staan en wordt de week enkel lichter.
  const pijnPlek = checkin?.pijn && noemtEenPlek(checkin?.pijn_waar) ? String(checkin.pijn_waar) : null;

  // De geschiedenis van dit plan: hoe vaak op rij "goed" per oefening, en met hoeveel herhalingen
  // het plan begon. Beide stonden hier ooit hard op een waarde die nooit klopte (0 en "de reps van
  // deze week"), waardoor twee regels uit progressie.js in de praktijk niet bestonden.
  const { reeksGoedPer, startRepsPer } = await geschiedenisVanPlan(admin, { weken: weken || [], totEnMet: huidige.weeknummer });

  // Zei het lid dat de week hem opgebruikt heeft? Dan vervalt het duwtje deze week. Zonder deze
  // regel was niet komen opdagen de enige manier om een lichtere week te krijgen.
  const op = uitgeput(checkin);

  const oordeelPerSessie = new Map((sessies || []).map((s) => [s.program_day_id, s.oordeel]));
  const seinen = {};
  for (const o of oefeningen || []) {
    const rauw = oordeelPerSessie.get(o.program_day_id) || checkin?.zwaarte || "goed";
    seinen[o.id] = {
      oordeel: dempOordeel(rauw, checkin),
      reeksGoed: op ? 0 : (reeksGoedPer.get(o.exercise_id) || 0),
      pijn: !!pijnPlek && raaktPijn(bibOp.get(o.exercise_id)?.category, pijnPlek),
    };
  }

  const besluitEnz = volgendeWeek(
    (oefeningen || []).map((o) => ({ ...o, start_reps: startRepsPer.get(o.exercise_id) ?? o.reps })),
    seinen,
    { gepland, afgevinkt, checkinIngevuld: !!checkin, pijn: !!checkin?.pijn, teZwaarWeken, pijnWeken }
  );

  // Twee takken openen GEEN nieuwe week: ze vragen iets aan het lid. Precies daarom moeten ze
  // zichzelf kunnen beëindigen — de week blijft anders open staan, de cron vindt volgende zondag
  // dezelfde toestand, en dan vertrekt dezelfde mail tot in de eeuwigheid. `volgende.besluit`
  // draagt het antwoord: staat het er al, dan vroegen we het vorige week ook al.
  if (besluitEnz.besluit === "pauze_vragen") {
    const alGevraagd = volgende.besluit === "pauze_vragen";
    await admin.from("coaching_weeks").update({ besluit: "pauze_vragen" }).eq("id", volgende.id);
    if (alGevraagd) {
      // Tweede keer, nog steeds niets gehoord. Dan pauzeren we zelf in plaats van te blijven vragen.
      await admin.from("coaching_plans").update({ status: "gepauzeerd" }).eq("id", planId);
      return { ok: true, besluit: "pauze_vragen", gepauzeerd: true };
    }
    return { ok: true, besluit: "pauze_vragen" };
  }
  if (besluitEnz.besluit === "doorverwijzen") {
    const alGemeld = !!plan.doorverwezen_at;
    await admin.from("coaching_weeks").update({ besluit: "doorverwijzen" }).eq("id", volgende.id);
    // Eén keer stempelen, niet elke zondag opnieuw: dit is het moment waarop de coach zegt dat een
    // mens beter meekijkt, en tegelijk het moment waarop er voor het beheer een lead ligt.
    if (!alGemeld) {
      await admin.from("coaching_plans").update({
        doorverwezen_at: new Date().toISOString(),
        doorverwijs_reden: besluitEnz.reden || "meerdere weken te zwaar",
      }).eq("id", planId);
    } else {
      // Al gemeld en het staat er nog steeds. Blijven mailen helpt niemand; het plan gaat op pauze
      // tot het lid of een coach er iets mee doet.
      await admin.from("coaching_plans").update({ status: "gepauzeerd" }).eq("id", planId);
    }
    return { ok: true, besluit: "doorverwijzen", reden: besluitEnz.reden || null, alGemeld, gepauzeerd: alGemeld };
  }

  // Nieuwe week samenstellen: dezelfde structuur, met de aangepaste voorschriften.
  //
  // Het volume is een VERHOUDING ten opzichte van de week die net afliep, niet een absolute factor.
  // Dat is het verschil tussen een lichtere week en een plan dat elke maand permanent krimpt: elke
  // week wordt uit de vorige gebouwd, dus een factor 0,6 die niet teruggedraaid wordt, blijft
  // doorwerken tot er nog één set overblijft.
  const vorigDeel = huidige.is_rustweek ? RUSTWEEK_DEEL : 1;
  let deel = (volgende.is_rustweek ? RUSTWEEK_DEEL : 1) / vorigDeel;
  // "Inkorten" en "aanpassen" maken de week lichter, maar laten geen sessie vallen. Een dag
  // wegsnijden was permanent: de week erna wordt uit deze week gebouwd en die dag stond er dan
  // gewoon niet meer in — na twee slechte weken traint iemand nog één keer per week zonder dat
  // iemand dat zo besloten heeft.
  if (besluitEnz.besluit === "inkorten") deel *= 0.75;
  if (besluitEnz.besluit === "aanpassen") deel *= 0.85;
  const dagenLijst = dagen || [];

  const gebruikt = [];
  const nieuweSessies = dagenLijst.map((d) => {
    const eigen = besluitEnz.oefeningen.filter((o) => o.program_day_id === d.id);
    const oefs = eigen.map((o) => {
      if (o.vervangen) {
        // Pijn: dezelfde plek, andere oefening.
        const oud = bibOp.get(o.exercise_id);
        const { gekozen } = kiesOefeningen(
          [{ categorie: oud?.category || "core", mechanic: null, sectie: o.section, sets: o.sets, reps: o.reps, rust: o.rest_sec }],
          bib, { niveau: plan.doel ? "soms" : "soms", vermijd: [...gebruikt, o.exercise_id], zaad: `${planId}|w${volgende.weeknummer}|${o.id}` }
        );
        return gekozen[0] ? { ...gekozen[0], target_weight_kg: null } : null;
      }
      return {
        exercise_id: o.exercise_id, sets: Math.max(1, Math.round(o.sets * deel)), reps: o.reps,
        rust: o.rest_sec, sectie: o.section, target_weight_kg: o.target_weight_kg,
      };
    }).filter(Boolean);
    oefs.forEach((o) => gebruikt.push(o.exercise_id));
    return { naam: d.name, oefeningen: oefs };
  }).filter((s) => s.oefeningen.length);

  if (!nieuweSessies.length) return { error: "De volgende week kon niet samengesteld worden." };
  const keuring = keurVoorschriften(nieuweSessies.flatMap((s) => s.oefeningen), new Set(bib.map((b) => b.id)));
  if (!keuring.ok) {
    console.error("coaching: volgende week afgekeurd", keuring.fout.slice(0, 3));
    return { error: "De volgende week kon niet gecontroleerd worden." };
  }

  const { programId, dagIds: nieuweDagIds } = await schrijfWeekProgramma(admin, {
    gymId, memberId: plan.member_id, planNaam: "Coaching", weeknummer: volgende.weeknummer, sessies: nieuweSessies,
  });
  // De rest van de app gaat uit van één actief programma per lid (zie de RPC set_active_plan uit
  // 0062). Elke coachingweek een nieuw actief programma laten worden, betekende dat "+ in mijn
  // schema" vanaf week 2 stilletjes in de AI-week schreef.
  if (huidige.program_id) {
    await admin.from("programs").update({ is_active: false }).eq("id", huidige.program_id);
  }

  // De zin. Faalt het model, dan schrijven we er zelf een — een week gaat nooit niet open omdat
  // een taalmodel stilviel.
  let analyse = null;
  const rem = await magNogOfBoek(admin, { gymId, memberId: plan.member_id, soort: "weekzin" });
  if (rem.mag) {
    const { data: profiel } = await admin.from("profiles").select("*").eq("id", plan.member_id).maybeSingle();
    const context = bouwContext(profiel || {});
    const vorige = (weken || []).filter((w) => w.weekanalyse && w.weeknummer < volgende.weeknummer)
      .map((w) => ({ week: w.weeknummer, tekst: w.weekanalyse }));
    const uit = await roepMetTerugval({
      model: MODELLEN.tekst,
      system: analyseSysteem(),
      messages: [{ role: "user", content: analyseVraag(context, {
        week: huidige.weeknummer, afgevinkt, gepland, checkin,
        besluit: besluitEnz.besluit, besluitReden: besluitEnz.reden,
        vorigeAnalyses: vorige,
        aanpassingen: besluitEnz.oefeningen.filter((o) => o.aangepast).map((o) => o.reden).slice(0, 8),
      }) }],
      maxTokens: 500,
      temperatuur: 0.5,
    });
    const boeking = await boekVerbruik(admin, { gymId, memberId: plan.member_id, soort: "weekzin", uitkomst: uit });
    if (uit.ok) analyse = uit.tekst.slice(0, 1200);
    await boekResultaat(admin, boeking.id, uit.ok ? "zin_geschreven" : "gateway_faalde");
  }
  if (!analyse) analyse = zelfgeschrevenZin(besluitEnz, afgevinkt, gepland, volgende.is_rustweek);

  await admin.from("coaching_weeks").update({
    program_id: programId, weekanalyse: analyse, besluit: besluitEnz.besluit,
    unlocked_at: new Date().toISOString(),
  }).eq("id", volgende.id);
  await admin.from("coaching_weeks").update({ completed_at: new Date().toISOString() }).eq("id", huidige.id);
  await schrijfSessies(admin, { gymId, weekId: volgende.id, dagIds: nieuweDagIds });

  return { ok: true, weekId: volgende.id, besluit: besluitEnz.besluit, analyse };
}

/**
 * De zin die boven week 1 staat. Geschreven, niet gegenereerd.
 *
 * Week 1 was de enige week zonder stem: `weekanalyse` wordt pas vanaf week 2 geschreven, want pas
 * dan is er iets gebeurd om over te schrijven. Het gevolg was dat het allereerste scherm dat iemand
 * na de intake ziet — het scherm dat moet overtuigen — geen enkele zin bevatte die tegen hém ging.
 *
 * Waarom geen modelaanroep: deze zin is elke keer hetzelfde soort zin en hangt van niets af behalve
 * het aantal sessies. Een model zou hier alleen kosten, wachttijd en de kans op een slechte dag
 * toevoegen. De enige variatie die telt is de toon die het lid zelf koos.
 */
export function eersteWeekZin({ sessiesPerWeek, toon }) {
  const n = Math.max(1, Number(sessiesPerWeek) || 3);
  const keer = n === 1 ? "één sessie" : `${n} sessies`;
  if (toon === "scherp") {
    return `Week 1 is een meting, geen test. Ik weet nog niet wat voor jou licht of zwaar is, dus dit is bewust behapbaar: ${keer}. Vink na elke sessie af hoe het voelde — dat is wat week 2 bepaalt. Doe je dat niet, dan blijft alles staan waar het staat.`;
  }
  return `Welkom. Week 1 is je vertrekpunt: ${keer}, bewust behapbaar, want ik weet nog niet wat voor jou licht of zwaar aanvoelt. Vink na elke sessie af hoe het ging — dat ene tikje is waar ik je volgende week op bouw. Er staat geen tempo op; beginnen is genoeg.`;
}

/** Wanneer het model niets kon zeggen. Geen excuus, gewoon de feiten. */
export function zelfgeschrevenZin(besluitEnz, afgevinkt, gepland, rustweek) {
  const start = afgevinkt >= gepland
    ? `Je hebt alle ${gepland} sessies van vorige week afgewerkt.`
    : `Je deed ${afgevinkt} van de ${gepland} sessies.`;
  const vervolg = {
    door: "We gaan gewoon verder, iets zwaarder waar dat kon.",
    inkorten: "Deze week is wat korter, zodat je weer bij bent.",
    herhaal: "We doen dezelfde week nog een keer — geen haast.",
  }[besluitEnz.besluit] || "We gaan verder.";
  return `${start} ${vervolg}${rustweek ? " Dit is bewust een lichtere week; die hoort erbij." : ""}`;
}

/** Het volledige dossier voor /coaching. */
export async function dossierVoor(admin, memberId) {
  // Ook een GEPAUZEERD plan hoort hier. Filterde dit op status 'lopend', dan verdween het hele
  // dossier zodra de cron zelf pauzeerde (twee stille weken) — inclusief de knop om te hervatten,
  // die op precies dat scherm staat. Het lid zag dan de intakewizard alsof hij nooit begonnen was.
  const { data: plannen } = await admin.from("coaching_plans")
    .select("*").eq("member_id", memberId).in("status", ["lopend", "gepauzeerd"])
    .order("created_at", { ascending: false }).limit(1);
  const plan = (plannen || [])[0] || null;
  if (!plan) return { plan: null };

  const { data: weken } = await admin.from("coaching_weeks").select("*").eq("plan_id", plan.id).order("weeknummer");
  const open = [...(weken || [])].reverse().find((w) => w.unlocked_at) || null;
  let sessies = [];
  let oefeningen = [];
  if (open) {
    const { data: s } = await admin.from("coaching_sessions").select("*").eq("week_id", open.id).order("volgnummer");
    sessies = s || [];
    if (open.program_id) {
      const { data: d } = await admin.from("program_days").select("id, day_no, name").eq("program_id", open.program_id).order("day_no");
      const ids = (d || []).map((x) => x.id);
      const { data: pe } = await admin.from("program_exercises")
        .select("id, program_day_id, sets, reps, rest_sec, position, section, target_weight_kg, exercises(id, name, slug, category, animation_url, image_url)")
        .in("program_day_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).order("position");
      oefeningen = (pe || []).map((r) => ({ ...r, dag: (d || []).find((x) => x.id === r.program_day_id) }));
    }
  }
  const { data: checkin } = open
    ? await admin.from("coaching_checkins").select("*").eq("week_id", open.id).maybeSingle()
    : { data: null };

  // Het menu van deze week en de mijlpalen. Beide staan los van het trainingsplan: het menu omdat
  // Meal plan een eigen module is, de mijlpalen omdat ze over het lid gaan en niet over dit plan.
  const { data: menu } = open
    ? await admin.from("coaching_mealweeks")
        .select("id, weeknummer, menu, boodschappen, kcal_richtlijn, toelichting")
        .eq("member_id", memberId).eq("weeknummer", open.weeknummer).eq("plan_id", plan.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const { data: mijlpalen } = await admin.from("coaching_mijlpalen")
    .select("soort, created_at").eq("member_id", memberId).order("created_at");

  // De stand van het HELE plan, voor de eerstvolgende mijlpaal. Wie Motivatie aanzette zag daar
  // niets van tot er toevallig iets bereikt was — een gekozen module die onzichtbaar blijft, voelt
  // als een module die niet werkt. Nu staat er een doel in plaats van een leeg vak.
  const alleWeekIds = (weken || []).map((w) => w.id);
  const { data: alleSessies } = alleWeekIds.length
    ? await admin.from("coaching_sessions").select("week_id, gedaan_at").in("week_id", alleWeekIds)
    : { data: [] };
  // ALLEEN de weken die voorbij zijn. Een nog niet geopende week heeft geen sessierijen en zou als
  // "niet volledig" lezen; omdat wekenOpRij vanaf het einde telt, maakte dat de uitkomst altijd 0
  // en kon "drie volle weken op rij" nooit gehaald worden — het doel op het scherm bleef dan eeuwig
  // op dezelfde afstand staan.
  const voorbij = (weken || []).filter((w) => w.completed_at);
  const volledig = voorbij.map((w) => {
    const eigen = (alleSessies || []).filter((x) => x.week_id === w.id);
    return eigen.length > 0 && eigen.every((x) => x.gedaan_at);
  });
  const stand = {
    afgevinkt: (alleSessies || []).filter((x) => x.gedaan_at).length,
    wekenAf: (weken || []).filter((w) => w.completed_at).length,
    planWeken: plan.weken,
    opRij: wekenOpRij(volledig),
  };

  // De boekingen van dit lid. Zonder deze had het scherm geen enkele datum: "week 1 van 8, 0 van 3
  // gedaan" is een lijstje, geen plan. En zonder boeking gebeurt er niets — geen zaal, geen
  // deurcode, geen workout in de mail — dus het tekort aan boekingen is de belangrijkste stand op
  // dit scherm.
  // Ver genoeg terug om de HELE open week te dekken. Een vaste acht dagen was te kort: een week
  // blijft open tot de zondagcron hem afwerkt, en die kan langer wegblijven (pauze_vragen,
  // doorverwijzen, of een overgeslagen beurt). Dan viel de boeking van dag één buiten beeld.
  const weekStart = open?.unlocked_at ? new Date(open.unlocked_at).getTime() - 86400000 : Date.now() - 8 * 86400000;
  const vanaf = new Date(Math.min(weekStart, Date.now() - 8 * 86400000)).toISOString();
  const { data: boekingen } = await admin.from("bookings")
    .select("id, starts_at, ends_at, services(name)")
    .eq("user_id", memberId).eq("status", "bevestigd")
    .gte("starts_at", vanaf).order("starts_at").limit(20);

  // Wat er veranderde ten opzichte van vorige week. Dit is het antwoord op "wat deed mijn vinkje
  // eigenlijk?" — tot nu veranderde de week zichtbaar niets en was afvinken dus een handeling
  // zonder gevolg.
  const vorige = open ? (weken || []).find((w) => w.weeknummer === open.weeknummer - 1) : null;
  let vorigVoorschrift = {};
  if (vorige?.program_id) {
    const { data: vd } = await admin.from("program_days").select("id").eq("program_id", vorige.program_id);
    const vIds = (vd || []).map((d) => d.id);
    if (vIds.length) {
      const { data: vo } = await admin.from("program_exercises")
        .select("exercise_id, sets, reps, target_weight_kg").in("program_day_id", vIds);
      for (const o of vo || []) vorigVoorschrift[o.exercise_id] = { sets: o.sets, reps: o.reps, kg: o.target_weight_kg };
    }
  }

  return {
    plan, weken: weken || [], open, sessies, oefeningen,
    checkin: checkin || null, menu: menu || null, mijlpalen: mijlpalen || [],
    boekingen: boekingen || [], vorigVoorschrift, stand,
  };
}

/**
 * Wat een échte coach van het AI-dossier te zien krijgt. Bewust minder dan het lid zelf ziet:
 * het plan, de weekanalyses en de check-ins — géén weekmenu. Voeding is gevoeliger dan een
 * trainingsschema, en 0158 geeft er daarom bewust geen coachbeleid op. Wie wil dat zijn coach het
 * menu ziet, stuurt het zelf door.
 *
 * De machtiging (een aanvaarde coach_clients-koppeling) hoort bij de aanroeper — deze functie
 * controleert ze niet en mag dus nooit vanaf een pagina gebruikt worden die dat niet deed.
 */
export async function dossierVoorCoach(admin, memberId) {
  const { data: plan } = await admin.from("coaching_plans")
    .select("id, doel, weken, status, gestart_op, afgerond_at, doorverwezen_at, doorverwijs_reden, samenvatting")
    .eq("member_id", memberId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!plan) return { plan: null, weken: [], checkins: [] };

  const { data: weken } = await admin.from("coaching_weeks")
    .select("id, weeknummer, weekanalyse, besluit, is_rustweek, unlocked_at, completed_at")
    .eq("plan_id", plan.id).order("weeknummer");
  const ids = (weken || []).map((w) => w.id);
  const { data: checkins } = ids.length
    ? await admin.from("coaching_checkins")
        .select("week_id, zwaarte, verloop, energie, pijn, pijn_waar, vrij, created_at").in("week_id", ids)
    : { data: [] };

  return { plan, weken: weken || [], checkins: checkins || [] };
}
