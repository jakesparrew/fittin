// Mijlpalen. Golf 4 van het plan — de motivatiekant.
//
// Twee keuzes die deze module klein houden:
//
//   1. GEEN MODEL. Motivatie is precies het soort tekst waar een taalmodel superlatieven van maakt.
//      Deze zinnen staan hier, geschreven, en veranderen niet. Ze kosten niets en ze zijn nooit
//      gênant.
//   2. EEN RIJ, NIET EEN BEREKENING. Elke mijlpaal wordt één keer weggeschreven in
//      `coaching_mijlpalen` (uniek op lid + soort). Zonder die rij zou een cron die elke zondag
//      draait "je eerste week is rond" elke zondag opnieuw vieren, en dan is het geen mijlpaal meer
//      maar behang.

/**
 * De mijlpalen, met een rang. De rang bepaalt welke er vermeld wordt wanneer er in één keer meer
 * dan één bereikt is: de zwaarste. Twee felicitaties in dezelfde mail is er één te veel.
 */
export const MIJLPALEN = {
  eerste_sessie: {
    rang: 1,
    titel: "Je eerste sessie zit erop",
    tekst: "De eerste is de moeilijkste. Alles daarna is herhaling — en herhaling is precies wat werkt.",
  },
  eerste_week: {
    rang: 2,
    titel: "Je eerste week is rond",
    tekst: "Eén week zegt nog niets over je lichaam en alles over je gewoonte. Die is nu begonnen.",
  },
  tien_sessies: {
    rang: 3,
    titel: "Tien sessies",
    tekst: "Tien keer kwam je opdagen. Daar komt vooruitgang vandaan — niet uit één zware dag.",
  },
  drie_op_rij: {
    rang: 4,
    titel: "Drie volle weken op rij",
    tekst: "Drie weken waarin je alles afwerkte. Dit is meestal het punt waarop het minder moeite begint te kosten.",
  },
  halfweg: {
    rang: 5,
    titel: "Je bent halfweg",
    tekst: "De helft van je plan zit erop. De tweede helft is zwaarder op papier en lichter in het echt.",
  },
  vijfentwintig_sessies: {
    rang: 6,
    titel: "Vijfentwintig sessies",
    tekst: "Vijfentwintig. Dat is geen opflakkering meer, dat is een gewoonte.",
  },
  plan_af: {
    rang: 7,
    titel: "Je plan is uit",
    tekst: "Alle weken afgewerkt. Zin in een volgend plan? Je coach begint van waar je nu staat, niet van nul.",
  },
};

/**
 * Welke mijlpalen zijn bereikt, gegeven de stand van het dossier. Puur — geen databank, geen tijd,
 * geen willekeur. Dat maakt hem testbaar en maakt de cron voorspelbaar.
 *
 * @param afgevinkt   aantal sessies dat ooit afgevinkt werd binnen dit plan
 * @param wekenAf     aantal afgeronde weken
 * @param planWeken   lengte van het plan
 * @param opRij       aantal volledig afgewerkte weken op rij, op het einde geteld
 */
export function bepaalMijlpalen({ afgevinkt = 0, wekenAf = 0, planWeken = 0, opRij = 0 }) {
  const uit = [];
  if (afgevinkt >= 1) uit.push("eerste_sessie");
  if (wekenAf >= 1) uit.push("eerste_week");
  if (afgevinkt >= 10) uit.push("tien_sessies");
  if (opRij >= 3) uit.push("drie_op_rij");
  // Halfweg pas vanaf een plan van vier weken: bij drie weken is "halfweg" hetzelfde moment als
  // "je eerste week is rond", en dan vier je twee keer hetzelfde.
  if (planWeken >= 4 && wekenAf >= Math.ceil(planWeken / 2)) uit.push("halfweg");
  if (afgevinkt >= 25) uit.push("vijfentwintig_sessies");
  if (planWeken > 0 && wekenAf >= planWeken) uit.push("plan_af");
  return uit;
}

/**
 * De eerstvolgende mijlpaal die nog niet gehaald is, met hoe ver het nog is.
 *
 * Waarom dit bestaat: wie Motivatie aanzette in de intake, zag daar op zijn scherm NIETS van tot er
 * toevallig iets bereikt was. Een module die je koos en die onzichtbaar blijft, voelt als een module
 * die niet werkt. Tegelijk geldt de regel dat lege UI onzichtbaar hoort te zijn — dus tonen we geen
 * leeg vak maar een doel. Een doel is inhoud.
 *
 * Puur, net als de rest van dit bestand: geen databank, geen klok.
 * @returns {null | {soort:string, titel:string, nog:string}}
 */
export function volgendeMijlpaal({ afgevinkt = 0, wekenAf = 0, planWeken = 0, opRij = 0 }) {
  const sessies = (n) => `nog ${n} ${n === 1 ? "sessie" : "sessies"}`;
  const weken = (n) => `nog ${n} ${n === 1 ? "week" : "weken"}`;
  const halfwegBij = planWeken >= 4 ? Math.ceil(planWeken / 2) : null;

  // Op rang, van licht naar zwaar: je hoort te zien wat er nú binnen bereik ligt, niet wat er over
  // twee maanden komt.
  const kandidaten = [
    ["eerste_sessie", afgevinkt >= 1, () => sessies(1 - afgevinkt)],
    ["eerste_week", wekenAf >= 1, () => weken(1 - wekenAf)],
    ["tien_sessies", afgevinkt >= 10, () => sessies(10 - afgevinkt)],
    ["drie_op_rij", opRij >= 3, () => `nog ${3 - opRij} ${3 - opRij === 1 ? "volle week" : "volle weken"} op rij`],
    ["halfweg", halfwegBij === null || wekenAf >= halfwegBij, () => weken(halfwegBij - wekenAf)],
    ["vijfentwintig_sessies", afgevinkt >= 25, () => sessies(25 - afgevinkt)],
    ["plan_af", planWeken > 0 && wekenAf >= planWeken, () => weken(planWeken - wekenAf)],
  ];

  for (const [soort, gehaald, afstand] of kandidaten) {
    if (!gehaald) return { soort, titel: MIJLPALEN[soort].titel, nog: afstand() };
  }
  return null;
}

/** Van een lijst soorten naar de zwaarste. Null wanneer de lijst leeg is. */
export function zwaarste(soorten) {
  const geldig = (soorten || []).filter((s) => MIJLPALEN[s]);
  if (!geldig.length) return null;
  const soort = geldig.reduce((a, b) => (MIJLPALEN[b].rang > MIJLPALEN[a].rang ? b : a));
  return { soort, ...MIJLPALEN[soort] };
}

/** Hoeveel volledige weken op rij, geteld vanaf het einde. */
export function wekenOpRij(volledig) {
  let n = 0;
  for (let i = (volledig || []).length - 1; i >= 0; i--) {
    if (!volledig[i]) break;
    n++;
  }
  return n;
}

/**
 * Schrijft de nieuwe mijlpalen weg en geeft terug wat er nog níet gemeld is. De rij wordt
 * aangemaakt zodra de mijlpaal bereikt is; `gemeld_at` wordt pas gezet wanneer de mail effectief
 * vertrok — anders verliest een lid zijn felicitatie aan een mail die niet aankwam.
 */
export async function noteerMijlpalen(admin, { gymId, memberId, stand }) {
  const bereikt = bepaalMijlpalen(stand);
  if (!bereikt.length) return { nieuwe: [], alles: [] };

  const { data: bestaande } = await admin.from("coaching_mijlpalen")
    .select("soort, gemeld_at").eq("member_id", memberId);
  const gekend = new Map((bestaande || []).map((r) => [r.soort, r]));

  const toeTeVoegen = bereikt.filter((s) => !gekend.has(s));
  if (toeTeVoegen.length) {
    const { error } = await admin.from("coaching_mijlpalen").insert(
      toeTeVoegen.map((soort) => ({ gym_id: gymId, member_id: memberId, soort }))
    );
    // Een dubbele rij is geen fout maar een race — twee zondagen die elkaar overlappen. Doorgaan.
    if (error && !String(error.message || "").includes("duplicate")) {
      return { nieuwe: [], alles: bereikt, error: error.message };
    }
  }

  const ongemeld = bereikt.filter((s) => !gekend.get(s)?.gemeld_at);
  return { nieuwe: ongemeld, alles: bereikt };
}

/** Markeert één mijlpaal als gemeld. */
export async function markeerGemeld(admin, { memberId, soort }) {
  await admin.from("coaching_mijlpalen")
    .update({ gemeld_at: new Date().toISOString() })
    .eq("member_id", memberId).eq("soort", soort);
}
