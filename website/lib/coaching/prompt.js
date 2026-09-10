// Wat het model te zien krijgt, en wat het nooit te zien krijgt.
//
// De harde regel: naam, e-mailadres, telefoonnummer, adres en de exacte geboortedatum gaan de deur
// niet uit. Ze dragen niets bij aan een trainingsvoorstel, dus ze horen niet in een prompt naar een
// externe partij. Wat er wél in mag — leeftijdsklasse, gewicht, beperkingen — mag dat alleen ná
// uitdrukkelijke toestemming (art. 9 AVG, `profiles.coaching_toestemming_at`). Zonder die
// toestemming krijgt het model die velden niet en wordt het expliciet verteld dat ze ontbreken,
// zodat het niet gaat gokken.
//
// lib/coaching/prompt.test.js bewaakt dat: er staat een test die de opgebouwde context afzoekt op
// een naam en een e-mailadres.

/** Leeftijd in klassen. Een exacte geboortedatum voegt niets toe aan een trainingsschema. */
export function leeftijdsklasse(geboortedatum, nu = new Date()) {
  if (!geboortedatum) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(geboortedatum).slice(0, 10));
  if (!m) return null;
  const [, j, mnd, d] = m.map(Number);
  let leeftijd = nu.getFullYear() - j;
  if (nu.getMonth() + 1 < mnd || (nu.getMonth() + 1 === mnd && nu.getDate() < d)) leeftijd -= 1;
  if (leeftijd < 18) return "onder 18";
  if (leeftijd < 30) return "18-29";
  if (leeftijd < 40) return "30-39";
  if (leeftijd < 50) return "40-49";
  if (leeftijd < 60) return "50-59";
  return "60+";
}

const DOELEN = {
  sterker: "sterker worden",
  conditie: "conditie verbeteren",
  afvallen: "afvallen",
  spiermassa: "spiermassa opbouwen",
  bewegen: "gewoon regelmatig bewegen",
};

const ERVARING = {
  nooit: "heeft nog nooit gestructureerd getraind",
  soms: "traint af en toe, kent de basisoefeningen",
  vaak: "traint regelmatig en is vertrouwd met vrije gewichten",
};

/**
 * Bouwt de context die naar het model gaat. Neemt een volledig profiel binnen en geeft alleen
 * terug wat eruit mag.
 */
export function bouwContext(profiel = {}, opties = {}) {
  const nu = opties.nu || new Date();
  const toestemming = !!profiel.coaching_toestemming_at;

  const context = {
    doel: DOELEN[profiel.coaching_doel] || DOELEN.bewegen,
    ervaring: ERVARING[profiel.coaching_ervaring] || ERVARING.soms,
    ervaringSleutel: profiel.coaching_ervaring || "soms",
    dagenPerWeek: profiel.coaching_dagen || 3,
    toon: profiel.coaching_toon === "scherp" ? "kort en direct" : "rustig en bemoedigend",
    toestemming,
  };

  // Alleen met toestemming. Geen toestemming = de velden bestaan niet voor het model.
  if (toestemming) {
    const klasse = leeftijdsklasse(profiel.geboortedatum, nu);
    if (klasse) context.leeftijdsklasse = klasse;
    if (profiel.gewicht_kg) context.gewichtKg = Number(profiel.gewicht_kg);
    if (profiel.geslacht) context.geslacht = profiel.geslacht;
    if (profiel.coaching_beperkingen) context.beperkingen = String(profiel.coaching_beperkingen).slice(0, 500);
  }

  return context;
}

/** De context als leesbare regels voor in de prompt. */
export function contextTekst(c) {
  const r = [
    `Doel: ${c.doel}`,
    `Ervaring: ${c.ervaring}`,
    `Traint ${c.dagenPerWeek} keer per week`,
  ];
  if (c.leeftijdsklasse) r.push(`Leeftijd: ${c.leeftijdsklasse}`);
  if (c.geslacht) r.push(`Geslacht: ${c.geslacht}`);
  if (c.gewichtKg) r.push(`Gewicht: ${c.gewichtKg} kg`);
  if (c.beperkingen) r.push(`Let op / vermijden: ${c.beperkingen}`);
  if (!c.toestemming) {
    r.push("Er is GEEN toestemming voor gezondheidsgegevens: je kent leeftijd, gewicht noch beperkingen. Ga daar niet naar raden en vraag er niet naar.");
  }
  return r.join("\n");
}

// ---------------------------------------------------------------------------
// De systeemprompts
// ---------------------------------------------------------------------------

const GEDRAG = `
Je bent de coach van Fittin', een privégym in Gent. Een lid boekt de zaal exclusief voor zichzelf en
traint alleen, zonder begeleider in de buurt. Schrijf in het Nederlands (Vlaams), je spreekt het lid
aan met "je".

Vaste grenzen, altijd:
- Je geeft GEEN medisch advies. Bij pijn: stoppen en een arts of kinesist raadplegen.
- Vermoed je een blessure, een aandoening, zwangerschap of medicatie die meespeelt, dan stel je geen
  schema op maar verwijs je door naar een menselijke coach van Fittin'.
- Je belooft geen resultaten en noemt geen streefgewichten of tijdlijnen voor gewichtsverlies.
- Je verzint NOOIT oefeningen. Je beschrijft alleen wat voor soort oefening op een plek hoort; de
  app kiest zelf een echte oefening uit de bibliotheek van de gym.
`.trim();

/** Prompt om een volledig plan op te stellen. Wordt één keer per plan gebruikt. */
export function planSysteem() {
  return `${GEDRAG}

Je stelt een trainingsplan op van meerdere weken. Je geeft ALLEEN geldige JSON terug, zonder
uitleg eromheen en zonder codeblok.

Vorm:
{
  "samenvatting": "2 tot 3 zinnen, gericht AAN het lid. Begin bij wat hij zelf antwoordde — zijn
                   doel, zijn ervaring, hoe vaak hij traint — en zeg wat je daarom gekozen hebt.
                   Begin NIET met 'Dit plan' of 'Het programma': dat leest als een
                   productbeschrijving en niet als iemand die iets tegen jou zegt. Geen opsomming,
                   geen belofte over resultaat of tijdlijn.",
  "weken": [ { "nr": 1, "focus": "korte omschrijving van maximaal 6 woorden" } ],
  "week1": {
    "sessies": [
      {
        "naam": "korte naam van de sessie, bv. Onderlichaam of Push",
        "blokken": [
          {
            "categorie": "benen | armen | schouders | rug | core | borst",
            "mechanic": "compound | isolation",
            "sectie": "Warming-up | Hoofdoefening | Accessoire | Finisher",
            "sets": 3,
            "reps": 10,
            "rust": 90
          }
        ]
      }
    ]
  }
}

Regels:
- "weken" bevat één regel per week van het plan, ook de weken die je nog niet uitwerkt.
- Werk ALLEEN week 1 uit in "week1". De latere weken worden pas gemaakt wanneer ze aan de beurt zijn,
  zodat ze rekening kunnen houden met hoe het gegaan is.
- Aantal sessies in week1 = het aantal keer per week dat het lid traint.
- 4 tot 6 blokken per sessie, altijd beginnend met een warming-up-blok.
- Verdeel de spiergroepen over de sessies; niet twee keer dezelfde categorie als hoofdoefening in
  dezelfde week, tenzij het lid maar één of twee keer per week traint.
- "reps" is een getal. "rust" in seconden, tussen 45 en 180.
- Voor een beginner: minder blokken, meer herhalingen, langere rust.
- De samenvatting is het eerste wat dit lid van je leest. Ze moet klinken alsof je zijn antwoorden
  gelezen hebt, niet alsof ze bij elk plan zou passen.`;
}

/** Prompt voor de wekelijkse zin. Klein en goedkoop; dit is het enige model-werk per week. */
export function analyseSysteem() {
  return `${GEDRAG}

Je schrijft de korte tekst die het lid bovenaan zijn nieuwe week leest. Twee tot vier zinnen,
gewone taal, geen opsomming, geen kopjes. Zeg wat er de afgelopen week gebeurde, wat dat betekent,
en wat er daarom deze week verandert. Wees concreet over de oefening of het gewicht als je dat weet.
Geen aanmoediging zonder inhoud ("goed bezig!"), geen emoji.

Geef ALLEEN die tekst terug, niets anders.`;
}

/** Prompt wanneer een week herbekeken moet worden (pijn, of drie weken te zwaar). */
export function herplanSysteem() {
  return `${GEDRAG}

Er is iets waardoor de gewone opbouw niet klopt: pijn, of het lid geeft al meerdere weken aan dat
alles te zwaar is. Je stelt de komende week bij. Geef ALLEEN geldige JSON terug:

{
  "uitleg": "2 tot 3 zinnen voor het lid: wat je aanpast en waarom.",
  "doorverwijzen": true of false,
  "sessies": [ { "naam": "...", "blokken": [ { "categorie": "...", "mechanic": "...", "sectie": "...", "sets": 3, "reps": 10, "rust": 90 } ] } ]
}

Zet "doorverwijzen" op true wanneer dit een menselijke coach vraagt: aanhoudende pijn, een
vermoedelijke blessure, of iets medisch. Laat "sessies" dan leeg.
Verminder anders het volume of de intensiteit, vermijd de categorie waar pijn gemeld werd, en
houd het aantal sessies gelijk.`;
}

/** Bouwt de gebruikersboodschap voor een nieuw plan. */
export function planVraag(context, { weken, sessiesPerWeek }) {
  return `${contextTekst(context)}

Plan van ${weken} weken, ${sessiesPerWeek} sessies per week.
Toon: ${context.toon}.

De zaal heeft: barbells, dumbbells, kettlebells, kabelstation, machines, weerstandsbanden,
medicine ball, fitnessbal, foam roller, en ruimte voor oefeningen met eigen lichaamsgewicht.`;
}

/** Bouwt de gebruikersboodschap voor de wekelijkse zin. */
export function analyseVraag(context, dossier) {
  const regels = [contextTekst(context), ""];
  if (dossier.vorigeAnalyses?.length) {
    regels.push("Wat je de vorige weken schreef:");
    for (const a of dossier.vorigeAnalyses.slice(-4)) regels.push(`- week ${a.week}: ${a.tekst}`);
    regels.push("");
  }
  regels.push(`Afgelopen week (week ${dossier.week}): ${dossier.afgevinkt} van ${dossier.gepland} sessies gedaan.`);
  if (dossier.checkin) {
    const c = dossier.checkin;
    regels.push(`Check-in — zwaarte: ${c.zwaarte || "niet gezegd"}, verloop: ${c.verloop || "niet gezegd"}, energie: ${c.energie || "niet gezegd"}${c.pijn ? `, PIJN gemeld: ${c.pijn_waar || "geen plaats opgegeven"}` : ""}.`);
    if (c.vrij) regels.push(`Het lid schreef zelf: "${String(c.vrij).slice(0, 400)}"`);
  } else {
    regels.push("Er is geen check-in ingevuld deze week.");
  }
  regels.push(`Besluit voor de komende week: ${dossier.besluit} (${dossier.besluitReden}).`);
  if (dossier.aanpassingen?.length) {
    regels.push("Wat er concreet verandert:");
    for (const a of dossier.aanpassingen.slice(0, 8)) regels.push(`- ${a}`);
  }
  return regels.join("\n");
}
