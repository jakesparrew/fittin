// De opvolging van een coachingplan, volledig in code. Geen model, geen tokens.
//
// Waarom dit bestaat: de eigenaar vroeg of het plan één keer door de AI gemaakt kan worden en
// daarna zonder AI opgevolgd. Het antwoord is ja voor het grootste deel, en dit bestand is dat deel.
// Progressieve overbelasting is geen intelligentie maar een tabel: wie zegt dat het te licht was
// krijgt meer, wie zegt dat het te zwaar was krijgt minder, en wie drie keer "goed" zegt staat stil
// en krijgt een duwtje. Een taalmodel voegt daar niets aan toe behalve kosten en onvoorspelbaarheid.
//
// Wat WEL een model nodig heeft, staat bewust niet hier: het plan opstellen (één keer), de zin die
// het lid elke week leest, en het herdenken van een week wanneer er iets breekt (pijn, drie keer te
// zwaar). Die drie roepen deze functies aan, niet omgekeerd.
//
// Alles hier is puur: dezelfde invoer geeft altijd dezelfde uitvoer, er wordt niets gelezen uit de
// klok of de databank. Zo is het testbaar en zo kan het nooit een hydratatiefout veroorzaken.

/** De drie oordelen die een lid na een sessie met één tik kan geven. */
export const OORDELEN = ["te_licht", "goed", "te_zwaar"];

/** Wat de coach met een week doet die niet af is. */
export const WEEKBESLUITEN = ["door", "inkorten", "herhaal", "pauze_vragen", "aanpassen", "doorverwijzen"];

// ---------------------------------------------------------------------------
// Gewicht
// ---------------------------------------------------------------------------

// Stapgrootte hangt af van het gewicht zelf. Een vaste +2,5 kg is 50% erbij op een halter van 5 kg
// en 2% op een squat van 120 kg — dat is niet dezelfde vraag. Deze schaal houdt de stap tussen
// grofweg 3% en 20%, en blijft altijd op een halve kilo vallen omdat de zaal geen kleinere
// schijven heeft.
export function stapVoor(kg) {
  if (!Number.isFinite(kg) || kg <= 0) return 0;
  if (kg < 10) return 1;
  if (kg < 30) return 2;
  return 2.5;
}

const halveKilo = (n) => Math.round(n * 2) / 2;

/**
 * Nieuw streefgewicht na een oordeel.
 * @param {number} kg      huidig streefgewicht, mag null zijn (oefening zonder gewicht)
 * @param {string} oordeel "te_licht" | "goed" | "te_zwaar"
 * @param {number} reeksGoed  hoeveel keer op rij "goed" — bij 3 duwen we toch op, anders sta je stil
 * @returns {number|null}
 */
export function volgendGewicht(kg, oordeel, reeksGoed = 0) {
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const stap = stapVoor(kg);
  if (oordeel === "te_licht") return halveKilo(kg + stap);
  // Terug is groter dan vooruit: wie zich vertilt heeft een echte stap terug nodig, geen halve.
  // 10% eraf, maar nooit minder dan één stap, en nooit onder de lege stang van 20 kg als we daar
  // al boven zaten — daaronder heeft "gewicht" geen betekenis meer in deze zaal.
  if (oordeel === "te_zwaar") {
    const terug = Math.max(stap, halveKilo(kg * 0.1));
    const nieuw = halveKilo(kg - terug);
    return kg > 20 ? Math.max(20, nieuw) : Math.max(1, nieuw);
  }
  // "goed": vasthouden. Behalve na drie keer dezelfde "goed" — dan is het niet meer goed maar
  // gewoon te makkelijk geworden, en drie weken stilstand voelt als niets bereiken.
  if (oordeel === "goed" && reeksGoed >= 3) return halveKilo(kg + stap);
  return halveKilo(kg);
}

// ---------------------------------------------------------------------------
// Herhalingen (voor oefeningen zonder gewicht: eigen lichaamsgewicht, band, machine op stand)
// ---------------------------------------------------------------------------

/**
 * Nieuw aantal herhalingen. Blijft binnen een band rond het startpunt: wie eindeloos herhalingen
 * stapelt doet na acht weken uithouding in plaats van kracht, en dat was het plan niet.
 * @param {number} reps    huidige herhalingen
 * @param {string} oordeel
 * @param {number} start   herhalingen waarmee het plan begon (de band is start .. start+4)
 */
export function volgendeHerhalingen(reps, oordeel, start = reps, reeksGoed = 0) {
  if (!Number.isFinite(reps) || reps <= 0) return null;
  const bovengrens = Math.max(start + 4, reps);
  const ondergrens = Math.max(4, Math.round(start * 0.6));
  if (oordeel === "te_licht") return Math.min(bovengrens, reps + 1);
  if (oordeel === "te_zwaar") return Math.max(ondergrens, reps - 2);
  if (oordeel === "goed" && reeksGoed >= 3) return Math.min(bovengrens, reps + 1);
  return reps;
}

// ---------------------------------------------------------------------------
// Eén oefening vooruitschuiven
// ---------------------------------------------------------------------------

/**
 * Past één voorschrift aan op basis van het oordeel. Werkt op een neutrale vorm, niet op een
 * databankrij: deze laag mag niets weten van kolomnamen (zie lib/coaching/plan.js voor de vertaling).
 *
 * @param {{sets:number, reps:number|null, rep_text:string|null, target_weight_kg:number|null, start_reps:number|null}} v
 * @param {{oordeel:string, reeksGoed:number, pijn:boolean}} sein
 * @returns {{...v, aangepast:boolean, reden:string}}
 */
export function schuifOefening(v, sein = {}) {
  const { oordeel = "goed", reeksGoed = 0, pijn = false } = sein;

  // Pijn overrulet alles. Er wordt niet "iets minder zwaar" gedaan met een oefening die pijn doet;
  // die gaat eruit. Het vervangen zelf is geen rekenwerk maar een keuze uit de bibliotheek, dus
  // dat markeren we hier en lossen we een laag hoger op.
  //
  // LET OP: `sein.pijn` hoort per OEFENING gezet te worden, niet per week. Stond hier ooit één
  // weekbrede vlag, dan verving één vinkje "ik had ergens pijn" het volledige schema — ook de
  // oefeningen die niets met die plek te maken hebben. Zie `raaktPijn` hieronder.
  if (pijn) return { ...v, vervangen: true, aangepast: true, reden: "pijn gemeld — oefening wordt vervangen" };

  const heeftGewicht = Number.isFinite(v.target_weight_kg) && v.target_weight_kg > 0;

  if (heeftGewicht) {
    const kg = volgendGewicht(v.target_weight_kg, oordeel, reeksGoed);
    const aangepast = kg !== v.target_weight_kg;
    return {
      ...v,
      target_weight_kg: kg,
      aangepast,
      reden: !aangepast ? "gewicht blijft" : kg > v.target_weight_kg ? `gewicht ${v.target_weight_kg} → ${kg} kg` : `gewicht terug naar ${kg} kg`,
    };
  }

  // Geen gewicht: dan bewegen de herhalingen. `rep_text` (bv. "zo veel mogelijk") laten we met rust —
  // daar valt niets aan te rekenen en het is bewust vrije tekst (bestaat sinds migratie 0071).
  if (v.rep_text) return { ...v, aangepast: false, reden: "vrij voorschrift, ongewijzigd" };

  const reps = volgendeHerhalingen(v.reps, oordeel, v.start_reps ?? v.reps, reeksGoed);
  const aangepast = reps !== v.reps;
  return {
    ...v,
    reps,
    aangepast,
    reden: !aangepast ? "herhalingen blijven" : `herhalingen ${v.reps} → ${reps}`,
  };
}

/**
 * Welke oefeningcategorieën raken de plek die het lid meldde.
 *
 * De check-in vraagt "waar precies?" als vrije tekst. Die tekst is het enige wat we hebben om te
 * bepalen wát vervangen moet worden. Vindt hij niets herkenbaars — of vulde het lid niets in — dan
 * vervangen we NIETS en wordt de week alleen lichter. Dat is de veilige kant: een oefening ten
 * onrechte vervangen kost het vertrouwen in het schema, een week te licht kost één week.
 */
export const PIJNPLEKKEN = [
  { woorden: ["knie", "been", "benen", "dij", "hamstring", "kuit", "heup", "lies", "bil", "enkel", "quad"], categorieën: ["benen"] },
  { woorden: ["schouder", "nek", "deltoid", "rotator"], categorieën: ["schouders"] },
  { woorden: ["rug", "onderrug", "lage rug", "lende", "lat", "wervel"], categorieën: ["rug"] },
  { woorden: ["borst", "pectoral", "ribben"], categorieën: ["borst"] },
  { woorden: ["arm", "biceps", "triceps", "elleboog", "pols", "onderarm", "hand"], categorieën: ["armen"] },
  { woorden: ["buik", "core", "romp"], categorieën: ["core"] },
];

export function raaktPijn(categorie, pijnWaar) {
  const t = String(pijnWaar || "").toLowerCase();
  if (!t.trim() || !categorie) return false;
  for (const plek of PIJNPLEKKEN) {
    if (plek.woorden.some((w) => t.includes(w))) {
      if (plek.categorieën.includes(String(categorie).toLowerCase())) return true;
    }
  }
  return false;
}

/** Herkent de tekst überhaupt een lichaamsdeel? Zo niet, dan wordt er niets vervangen. */
export function noemtEenPlek(pijnWaar) {
  const t = String(pijnWaar || "").toLowerCase();
  if (!t.trim()) return false;
  return PIJNPLEKKEN.some((plek) => plek.woorden.some((w) => t.includes(w)));
}

// ---------------------------------------------------------------------------
// Uitputting
// ---------------------------------------------------------------------------

/**
 * Dempt het oordeel wanneer het lid aangaf dat de week hem opgebruikt heeft.
 *
 * Dit dicht een gat dat lang open stond: de ENIGE manier om een lichtere week te krijgen, was niet
 * komen opdagen. Wie alles afwerkte en in de check-in "energie: laag" of "verloop: moeilijk"
 * aankruiste, kreeg de week erna gewoon meer — want die twee antwoorden werden bewaard en door
 * niets gelezen. Dat is de omgekeerde wereld voor een coach.
 *
 * Bewust klein gehouden: het duwtje vervalt, het volume niet. Volume afnemen op een AFGEWERKTE week
 * zou zich elke week opnieuw toepassen (elke week wordt uit de vorige gebouwd) en zo een neerwaartse
 * spiraal starten. Vlak blijven staan tot iemand weer bijkomt, is genoeg.
 *
 * @param {string} oordeel  wat het lid na de sessie tikte
 * @param {{energie?:string, verloop?:string}} checkin
 */
export function dempOordeel(oordeel, checkin) {
  if (!uitgeput(checkin)) return oordeel;
  // "Te zwaar" blijft staan: dat is een sterker signaal dan uitputting en hoort te blijven werken.
  return oordeel === "te_licht" ? "goed" : oordeel;
}

/** Zei het lid dat de week hem opgebruikt heeft? */
export function uitgeput(checkin) {
  return checkin?.energie === "laag" || checkin?.verloop === "moeilijk";
}

// ---------------------------------------------------------------------------
// Het besluit over een hele week
// ---------------------------------------------------------------------------

/**
 * Wat gebeurt er met de volgende week? Dit is de poort uit het plan: streng, maar niet strafbaar.
 *
 * Waarom niet gewoon "alles af of niets": een poort die dichtblijft tot alles af is, werkt één keer.
 * De tweede keer dat iemand ziek is of een drukke week heeft, is diezelfde poort een verwijt en
 * stopt het lid. De cijfers uit de zaal zeggen dat leden met gaten trainen, dus het plan moet
 * gaten aankunnen.
 *
 * @param {{gepland:number, afgevinkt:number, checkinIngevuld:boolean, pijn:boolean, teZwaarWeken:number, pijnWeken:number}} s
 * @returns {{besluit:string, reden:string}}
 */
export function weekBesluit(s) {
  const gepland = Math.max(0, s.gepland || 0);
  const afgevinkt = Math.max(0, Math.min(s.afgevinkt || 0, gepland));
  const deel = gepland === 0 ? 0 : afgevinkt / gepland;

  // Drie weken op rij te zwaar is geen progressieprobleem meer. Dan klopt het plan niet bij deze
  // persoon en hoort er een mens naar te kijken — dat is precies waar de coaches voor zijn.
  if ((s.teZwaarWeken || 0) >= 3) {
    return { besluit: "doorverwijzen", reden: "drie weken op rij te zwaar — een coach kijkt beter mee dan een aanpassing" };
  }
  // Hetzelfde geldt voor pijn die blijft terugkomen. Eén keer pijn is een oefening vervangen; drie
  // weken op rij pijn is geen schemaprobleem meer, en de check-in belooft het lid ook expliciet dat
  // de coach dan stopt met plannen.
  if ((s.pijnWeken || 0) >= 3) {
    return { besluit: "doorverwijzen", reden: "drie weken op rij pijn gemeld — daar hoort iemand naar te kijken" };
  }
  if (s.pijn) {
    return { besluit: "aanpassen", reden: "pijn gemeld — de week wordt herbekeken" };
  }
  // Niets gedaan en niets laten weten: dan is de vraag niet "welke week nu" maar "ben je er nog".
  if (afgevinkt === 0 && !s.checkinIngevuld) {
    return { besluit: "pauze_vragen", reden: "geen sessies en geen check-in — eerst vragen of het plan moet pauzeren" };
  }
  if (deel >= 1) return { besluit: "door", reden: "week volledig afgewerkt" };
  if (deel >= 0.5) return { besluit: "inkorten", reden: "meer dan de helft gedaan — de volgende week wordt korter zodat je bijbent" };
  return { besluit: "herhaal", reden: "minder dan de helft gedaan — deze week komt nog een keer" };
}

// ---------------------------------------------------------------------------
// Structuur van het plan
// ---------------------------------------------------------------------------

/**
 * Elke vierde week is lichter. Niet omdat het lid dat vraagt, maar omdat acht weken onafgebroken
 * opbouwen niemand volhoudt — en een geplande lichte week voelt als onderdeel van het plan terwijl
 * een ongeplande lichte week voelt als falen.
 */
export function isRustweek(weeknummer, totaal) {
  if (!Number.isFinite(weeknummer) || weeknummer < 1) return false;
  // Bij een kort plan (≤ 4 weken) heeft een rustweek geen zin; die zou een kwart van het plan zijn.
  if (totaal <= 4) return false;
  // Nooit de laatste week: daar wil je eindigen op je sterkst, niet uitbollen.
  if (weeknummer === totaal) return false;
  return weeknummer % 4 === 0;
}

/** Hoeveel procent van het volume in een rustweek. Als getal zodat de generator ermee kan rekenen. */
export const RUSTWEEK_DEEL = 0.6;

/**
 * Telt hoe vaak een oordeel op rij voorkwam, van de laatste week terug. Stopt bij het eerste
 * andere oordeel. Gebruikt om "drie keer goed" en "drie weken te zwaar" te herkennen.
 * @param {string[]} geschiedenis  oudste eerst
 */
export function reeksAanHetEind(geschiedenis, waarde) {
  if (!Array.isArray(geschiedenis)) return 0;
  let n = 0;
  for (let i = geschiedenis.length - 1; i >= 0; i--) {
    if (geschiedenis[i] === waarde) n++;
    else break;
  }
  return n;
}

/**
 * Het volledige besluit voor de volgende week, in één aanroep: wat er met de week gebeurt én wat
 * er met elke oefening gebeurt. Dit is de functie die de zondagcron aanroept.
 *
 * @param {object[]} voorschriften  de oefeningen van de afgelopen week (neutrale vorm)
 * @param {object} seinen           per oefening-id: { oordeel, reeksGoed, pijn }
 * @param {object} weekstand        invoer voor weekBesluit
 * @returns {{besluit:string, reden:string, oefeningen:object[], modelNodig:boolean}}
 */
export function volgendeWeek(voorschriften, seinen = {}, weekstand = {}) {
  const { besluit, reden } = weekBesluit(weekstand);

  // Bij deze drie is er geen rekenwerk maar een keuze te maken die een mens of een model moet doen.
  const modelNodig = besluit === "aanpassen" || besluit === "doorverwijzen";

  // Bij "herhaal" blijft alles staan zoals het was: je doet dezelfde week nog eens, niet een
  // zwaardere. Bij "pauze_vragen" wordt er niets gegenereerd tot het lid antwoordt.
  if (besluit === "herhaal" || besluit === "pauze_vragen") {
    return { besluit, reden, oefeningen: voorschriften.map((v) => ({ ...v, aangepast: false, reden: "ongewijzigd" })), modelNodig };
  }

  const oefeningen = voorschriften.map((v) => schuifOefening(v, seinen[v.id] || {}));
  return { besluit, reden, oefeningen, modelNodig };
}
