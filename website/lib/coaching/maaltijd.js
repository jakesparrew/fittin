// Het weekmenu. Golf 3 van het plan.
//
// Drie dingen maken dit anders dan de trainingskant, en ze zitten alle drie in code en niet in een
// prompt — een grens die je aan een taalmodel vraagt, is een verzoek; een grens in code is een grens.
//
//   1. GEEN TOESTEMMING, GEEN MENU. Een menu rekent met gewicht, lengte en leeftijd. Zonder die
//      cijfers is het raden, en raden hoort niet in iets waar mensen hun gezondheid aan ophangen.
//      Dus niet "een algemener menu" maar géén menu.
//   2. EEN HARDE ONDERGRENS. Nooit onder 1.500 kcal voor een vrouw of 1.800 voor een man. Een
//      voorstel dat eronder komt, wordt niet geleverd — ook niet als het model het zo bedoelde.
//   3. BIJ TWIJFEL STOPPEN. Zwangerschap, een eetstoornis, medicatie of een aandoening: dan geen
//      menu maar een verwijzing naar een diëtist.

import { roepMetTerugval, MODELLEN } from "./model.js";
import { magNog, boekVerbruik } from "./budget.js";
import { bouwContext, contextTekst } from "./prompt.js";
import { leesJson } from "./plan.js";
import { VOEDINGSVOORKEUREN } from "./voeding-velden.js";

/** Wat een lid kan aanvinken. Vrije tekst kan daarnaast, voor alles wat hier niet in past.
 *  De lijst zelf staat in een eigen bestand zodat het scherm hem kan gebruiken zonder deze module. */
export { VOEDINGSVOORKEUREN } from "./voeding-velden.js";

/** Woorden die het gesprek stoppen. Niet omdat we niets willen zeggen, maar omdat een taalmodel
 *  hier niet over hoort te oordelen. */
const STOPWOORDEN = [
  "zwanger", "borstvoeding", "eetstoornis", "anorexia", "boulimia", "diabet", "insuline",
  "nierziekte", "nierfalen", "chemo", "kanker", "medicatie", "bloedverdunner", "coeliakie",
  "crohn", "colitis", "schildklier", "hartfalen", "operatie",
];

export function vraagtOmEenDietist(tekst) {
  const t = String(tekst || "").toLowerCase();
  return STOPWOORDEN.some((w) => t.includes(w));
}

/**
 * Ondergrens per geslacht. Onder deze waarde wordt er niets geleverd.
 * Bewust conservatief en niet onderhandelbaar; wie lager wil, hoort bij een diëtist.
 */
export function kcalOndergrens(geslacht) {
  return geslacht === "Man" ? 1800 : 1500;
}

/**
 * Ruwe dagbehoefte volgens Mifflin-St Jeor, met een activiteitsfactor die meeschaalt met het
 * aantal sessies per week. Dit is een RICHTLIJN die we het model meegeven — niet iets wat we als
 * belofte tonen. Een formule kent geen mensen.
 */
export function dagbehoefte({ gewichtKg, lengteCm, leeftijd, geslacht, sessiesPerWeek = 3, doel = "bewegen" }) {
  if (!gewichtKg || !lengteCm || !leeftijd) return null;
  const bmr = 10 * gewichtKg + 6.25 * lengteCm - 5 * leeftijd + (geslacht === "Man" ? 5 : -161);
  // 1,2 zittend tot 1,6 bij zes sessies. Fittin-leden trainen gemiddeld drie keer per maand méér
  // dan ze zeggen, dus we schatten bewust aan de lage kant.
  const factor = 1.25 + Math.min(6, Math.max(0, sessiesPerWeek)) * 0.055;
  const onderhoud = Math.round(bmr * factor);
  // Afvallen: een tekort van ongeveer 15%, nooit meer. Spiermassa: een klein overschot.
  if (doel === "afvallen") return Math.round(onderhoud * 0.85);
  if (doel === "spiermassa") return Math.round(onderhoud * 1.1);
  return onderhoud;
}

const MOMENTEN = ["ontbijt", "lunch", "avondeten", "tussendoor"];
const DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];

/** Schoont het menu van het model op tot precies de vorm die de app toont. */
export function schoonMenu(rauw) {
  const dagen = Array.isArray(rauw?.dagen) ? rauw.dagen : [];
  const uit = DAGEN.map((naam, i) => {
    const d = dagen[i] || {};
    const maaltijden = {};
    for (const m of MOMENTEN) {
      const v = d?.[m];
      if (typeof v === "string" && v.trim()) maaltijden[m] = v.trim().slice(0, 200);
    }
    return { dag: naam, ...maaltijden };
  });
  // Een dag zonder enkele maaltijd is een gat; die telt niet mee als geldig menu.
  const gevuld = uit.filter((d) => MOMENTEN.some((m) => d[m]));
  return gevuld.length >= 5 ? uit : null;
}

export function schoonBoodschappen(rauw) {
  const lijst = Array.isArray(rauw) ? rauw : [];
  return lijst.slice(0, 60).map((r) => String(r || "").trim().slice(0, 120)).filter(Boolean);
}

/**
 * De richtlijn voor dit lid, of de reden waarom er geen menu komt. Apart van `maakWeekmenu` omdat
 * ook het hergebruik-pad moet weten of het nog mág — toestemming intrekken hoort een menu te
 * stoppen, ook een menu dat al bestond.
 */
export function richtlijnVoor(profiel) {
  // `ontbreekt` onderscheidt "dit lid moet nog iets invullen" van "er ging iets stuk". De cron
  // gebruikt dat verschil: het eerste is een normale toestand en hoort geen mislukte cronrun op te
  // leveren, het tweede wel.
  if (!profiel?.coaching_toestemming_at) {
    return { ontbreekt: true, error: "Voor een weekmenu hebben we je lengte, gewicht en leeftijd nodig. Zet die toestemming aan bij je gegevens." };
  }
  if (!profiel.gewicht_kg || !profiel.height_cm || !profiel.geboortedatum) {
    return { ontbreekt: true, error: "Vul je gewicht, lengte en geboortedatum in — zonder die drie kan een menu alleen maar gokken." };
  }
  const vrij = [profiel.coaching_beperkingen, profiel.coaching_voeding_vrij].filter(Boolean).join(" ");
  if (vraagtOmEenDietist(vrij)) {
    return { dietist: true, error: "Wat je invulde vraagt om een diëtist, niet om een app. Vraag het aan je huisarts — die verwijst je door." };
  }
  const leeftijd = new Date().getFullYear() - Number(String(profiel.geboortedatum).slice(0, 4));
  const behoefte = dagbehoefte({
    gewichtKg: Number(profiel.gewicht_kg), lengteCm: Number(profiel.height_cm), leeftijd,
    geslacht: profiel.geslacht, sessiesPerWeek: profiel.coaching_dagen || 3, doel: profiel.coaching_doel,
  });
  if (!behoefte) return { ontbreekt: true, error: "Er ontbreken gegevens om een menu te berekenen." };
  // De ondergrens is een grens, geen suggestie: ook als de formule lager uitkomt, gaan we er niet onder.
  return { richtlijn: Math.max(kcalOndergrens(profiel.geslacht), behoefte) };
}

/**
 * Moet er een níeuw menu komen, of mag dat van vorige week mee?
 *
 * Elke week een nieuw menu laten schrijven kost elke week opnieuw tokens, en voor wie tevreden is
 * verandert er niets — je eet in het echt ook niet elke week zeven andere dingen. Dus hergebruiken,
 * tenzij er een reden is. Die redenen komen uit de check-in: dát is wat "erop verder bouwen"
 * betekent aan de voedingskant.
 */
export function moetVernieuwen({ vorige, weeknummer, checkin, richtlijn }) {
  if (!vorige) return { ja: true, reden: "eerste_menu" };
  if (checkin?.menu_gevolgd === "niet") return { ja: true, reden: "lukte_niet" };
  if (checkin?.honger === "vaak") return { ja: true, reden: "honger" };
  const oud = Number(vorige.kcal_richtlijn);
  // Honderd kilocalorieën verschil is ongeveer drie kilo lichaamsgewicht. Daaronder is het ruis.
  if (Number.isFinite(richtlijn) && Number.isFinite(oud) && Math.abs(richtlijn - oud) >= 100) {
    return { ja: true, reden: "richtlijn_verschoven" };
  }
  if (Number(weeknummer) - Number(vorige.weeknummer) >= 4) return { ja: true, reden: "afwisseling" };
  return { ja: false, reden: "ongewijzigd" };
}

export const menuSysteem = () => `
Je bent de coach van Fittin', een privégym in Gent. Je stelt een weekmenu op. Schrijf in het
Nederlands (Vlaams), spreek het lid aan met "je".

Vaste grenzen:
- Je geeft GEEN medisch of diëtistisch advies. Je maakt een gewoon, haalbaar weekmenu.
- Je belooft nooit een gewichtsverlies, een tempo of een resultaat.
- Producten die in een gewone Belgische supermarkt liggen. Metrische maten (gram, ml, stuks) —
  nooit cups of ounces.
- Haalbaar op een doordeweekse dag: geen recept van veertig minuten voor een lunch.
- Herhaling mag. Wie elke ochtend hetzelfde ontbijt eet, hoeft geen zeven verschillende.
- Kort. Elke maaltijd is één zin van hoogstens vijftien woorden, met de portie erbij.

Geef ALLEEN geldige JSON terug, zonder uitleg eromheen en zonder codeblok:
{
  "toelichting": "2 tot 3 zinnen: waar dit menu op mikt en waarom het bij het doel past.",
  "dagen": [
    { "ontbijt": "…", "lunch": "…", "avondeten": "…", "tussendoor": "…" }
  ],
  "boodschappen": ["500 g havermout", "1 kg kipfilet", "…"]
}
"dagen" bevat exact zeven items, van maandag tot zondag.
"boodschappen" is de lijst voor die week, van vers naar houdbaar, hoogstens veertig regels.`.trim();

/**
 * Maakt het weekmenu. Geeft { error } terug wanneer het niet mag of niet lukt — nooit een half menu.
 */
export async function maakWeekmenu(admin, { gymId, memberId, profiel, weeknummer, planId = null, checkin = null }) {
  // ---- 1. Mag het, en hoeveel? Toestemming, stopwoorden en ondergrens zitten hier samen. ----
  const grens = richtlijnVoor(profiel);
  if (grens.error) return grens;
  const richtlijn = grens.richtlijn;

  const rem = await magNog(admin, gymId);
  if (!rem.mag) return { error: `De coach kan nu even geen menu maken (${rem.reden}).` };

  // ---- 2. De vraag ----
  const context = bouwContext(profiel);
  const voorkeuren = (profiel.coaching_voeding || []).map((v) => VOEDINGSVOORKEUREN.find((x) => x.v === v)?.l).filter(Boolean);
  const vraag = [
    contextTekst(context),
    `Richtlijn: ongeveer ${richtlijn} kcal per dag.`,
    voorkeuren.length ? `Voorkeuren: ${voorkeuren.join(", ")}.` : "Geen voedingsvoorkeuren opgegeven.",
    profiel.coaching_voeding_vrij ? `Zelf opgegeven: ${String(profiel.coaching_voeding_vrij).slice(0, 300)}` : "",
    checkin?.menu_gevolgd ? `Vorige week lukte het menu: ${checkin.menu_gevolgd}.` : "",
    checkin?.honger === "vaak" ? "Het lid had vaak honger — maak de porties ruimer of kies vullender." : "",
    checkin?.honger === "nee" ? "Het lid had geen honger — de porties mogen blijven." : "",
  ].filter(Boolean).join("\n");

  const uit = await roepMetTerugval({
    model: MODELLEN.plan,
    system: menuSysteem(),
    messages: [{ role: "user", content: vraag }],
    // Zeven dagen × vier momenten plus een boodschappenlijst is veel uitvoer. Bij 4.000 tokens
    // werd het antwoord afgekapt en viel het menu ongeldig terug — gemeten, niet vermoed.
    maxTokens: 8000,
    temperatuur: 0.5,
  });
  await boekVerbruik(admin, { gymId, memberId, soort: "menu", uitkomst: uit });
  if (!uit.ok) return { error: "De coach kon geen menu opstellen. Probeer het zo dadelijk opnieuw." };

  const json = leesJson(uit.tekst);
  const menu = schoonMenu(json);
  if (!menu) return { error: "Het menu kwam onvolledig terug. Probeer het opnieuw." };

  const { data, error } = await admin.from("coaching_mealweeks").upsert({
    gym_id: gymId, member_id: memberId, plan_id: planId, weeknummer,
    menu, boodschappen: schoonBoodschappen(json?.boodschappen),
    kcal_richtlijn: richtlijn,
    toelichting: typeof json?.toelichting === "string" ? json.toelichting.slice(0, 800) : null,
    toestemming_at: profiel.coaching_toestemming_at,
  }, { onConflict: "member_id,plan_id,weeknummer" }).select("id").single();
  if (error) return { error: `Het menu kon niet bewaard worden: ${error.message}` };

  return { ok: true, mealweekId: data.id, richtlijn, kostMicro: uit.kostMicro };
}

/**
 * Zorgt dat er een menu is voor deze week — en roept het model alleen wanneer dat nodig is.
 *
 * Dit is het voedings-equivalent van wat de trainingskant doet: het model schrijft één keer, de
 * code volgt op. Wie tevreden is, krijgt hetzelfde menu mee naar de volgende week; wie honger had
 * of het niet volgehouden kreeg, krijgt een nieuw. Dat scheelt niet alleen tokens — het is ook
 * gewoon eerlijker dan elke maandag doen alsof er iets veranderd is.
 */
export async function zorgVoorMenu(admin, { gymId, memberId, profiel, weeknummer, planId = null, checkin = null }) {
  const grens = richtlijnVoor(profiel);
  if (grens.error) return grens;

  // Binnen DÍT plan zoeken. Zonder die grens pakt een tweede plan het menu van week 8 van het
  // vorige plan als "vorige week", en dan klopt zowel de afwisseling als de richtlijn niet meer.
  let vraag = admin.from("coaching_mealweeks").select("*").eq("member_id", memberId);
  if (planId) vraag = vraag.eq("plan_id", planId);
  const { data: bestaande } = await vraag.order("weeknummer", { ascending: false }).limit(1);
  const vorige = (bestaande || [])[0] || null;
  if (vorige && Number(vorige.weeknummer) === Number(weeknummer)) {
    return { ok: true, mealweekId: vorige.id, alBestond: true, richtlijn: vorige.kcal_richtlijn };
  }

  const beslis = moetVernieuwen({ vorige, weeknummer, checkin, richtlijn: grens.richtlijn });
  if (!beslis.ja) {
    // Hetzelfde menu, een week verder. De toestemming wordt opnieuw vastgelegd op vandaag: het is
    // een nieuwe levering, en achteraf moet aantoonbaar zijn dat ze er tóen ook was.
    const { data, error } = await admin.from("coaching_mealweeks").upsert({
      gym_id: gymId, member_id: memberId, plan_id: planId, weeknummer,
      menu: vorige.menu, boodschappen: vorige.boodschappen,
      kcal_richtlijn: vorige.kcal_richtlijn, toelichting: vorige.toelichting,
      toestemming_at: profiel.coaching_toestemming_at,
    }, { onConflict: "member_id,plan_id,weeknummer" }).select("id").single();
    if (error) return { error: `Het menu kon niet meegenomen worden: ${error.message}` };
    return { ok: true, mealweekId: data.id, hergebruikt: true, richtlijn: vorige.kcal_richtlijn };
  }

  const uit = await maakWeekmenu(admin, { gymId, memberId, profiel, weeknummer, planId, checkin });
  return uit.ok ? { ...uit, reden: beslis.reden } : uit;
}

/** Het menu van één week, voor de pagina en de mail. */
export async function menuVoorWeek(admin, memberId, weeknummer, planId = null) {
  // `weeknummer` telt binnen een PLAN en begint bij elk nieuw plan opnieuw bij 1. Sinds 0159 mogen
  // twee plannen dus allebei een week 3 hebben — en dan is `maybeSingle()` op (lid, week) geen
  // ontdubbeling meer maar een fout. Vandaar de begrenzing op het plan én de limiet.
  let vraag = admin.from("coaching_mealweeks")
    .select("id, weeknummer, menu, boodschappen, kcal_richtlijn, toelichting")
    .eq("member_id", memberId).eq("weeknummer", weeknummer);
  if (planId) vraag = vraag.eq("plan_id", planId);
  const { data } = await vraag.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

/** Staat de maaltijdmodule aan bij dit lid? */
export function maaltijdenAan(profiel) {
  return Array.isArray(profiel?.coaching_modules) && profiel.coaching_modules.includes("mealplan");
}
