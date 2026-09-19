// Wat de coach-chat mag DOEN. Twee soorten gereedschap:
//   · LEZEN (vrije_momenten, zoek_oefening, onthoud) — de server voert het meteen uit, het model krijgt het
//     resultaat terug. Niets hiervan verandert iets aan een boeking, een plan of geld.
//   · VOORSTELLEN (stel_…_voor) — de server KEURT het voorstel (bestaat de boeking, is het uur vrij, is het jouw
//     oefening …) en zet het als kaart in het gesprek. Uitvoeren gebeurt pas na een tik van het lid, en dan
//     opnieuw gekeurd (chat-actions.js): tussen voorstel en tik kan de wereld veranderd zijn.
//
// Het model kiest nooit een lid-id, een gym-id of een prijs. Die komen altijd van de server.

// Enkel pure imports: CoachChat (client) leest kaartTekst uit dit bestand.
import { promoVoor, betaaldeUren, dowUur } from "../punten.js";
import { slotInstant } from "../time.js";

export const HORIZON_DAGEN = 21;
export const MAX_FEITEN = 10;
export const DUREN = [1, 1.5, 2, 3];

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GEREEDSCHAP = [
  {
    name: "vrije_momenten",
    description: "Vrije startmomenten in de gym (volle uren). ⚡ = rustig uur: 2 uur voor de prijs van 1 en dubbele punten. Gebruik dit VOOR je een boeking of verplaatsing voorstelt.",
    input_schema: {
      type: "object",
      properties: {
        van: { type: "string", description: "Eerste dag, YYYY-MM-DD. Standaard vandaag." },
        dagen: { type: "integer", description: "Aantal dagen (1-7). Standaard 3." },
        duur: { type: "number", description: "Gewenste duur in uren: 1, 1.5, 2 of 3. Standaard 1." },
        enkel_rustig: { type: "boolean", description: "Alleen rustige uren (⚡)." },
      },
    },
  },
  {
    name: "zoek_oefening",
    description: "Zoek oefeningen in de bibliotheek van de gym op naam of spiergroep. Geeft id's terug voor stel_oefeningwissel_voor.",
    input_schema: { type: "object", properties: { zoek: { type: "string" } }, required: ["zoek"] },
  },
  {
    name: "onthoud",
    description: "Onthoud één kort feit over het lid voor volgende gesprekken (max 120 tekens). Het lid ziet en kan wissen wat je onthoudt.",
    input_schema: { type: "object", properties: { feit: { type: "string" } }, required: ["feit"] },
  },
  {
    name: "stel_boeking_voor",
    description: "Stel een nieuwe gymsessie voor. Het lid bevestigt zelf; betalen gebeurt met tegoed of via de gewone betaalpagina.",
    input_schema: {
      type: "object",
      properties: {
        datum: { type: "string", description: "YYYY-MM-DD" },
        uur: { type: "integer", description: "Startuur, bv. 18 voor 18:00" },
        duur: { type: "number", description: "1, 1.5, 2 of 3 uur" },
      },
      required: ["datum", "uur", "duur"],
    },
  },
  {
    name: "stel_verplaatsing_voor",
    description: "Stel voor een bestaande boeking van het lid te verplaatsen (kan tot 6 uur vooraf). Gebruik het boeking-id uit de gegevens.",
    input_schema: {
      type: "object",
      properties: { boeking_id: { type: "string" }, datum: { type: "string" }, uur: { type: "integer" } },
      required: ["boeking_id", "datum", "uur"],
    },
  },
  {
    name: "stel_oefeningwissel_voor",
    description: "Stel voor een oefening in het plan van deze week te vervangen (bv. toestel bezet, oefening te moeilijk). Gebruik het plan-id uit de gegevens en een id uit zoek_oefening.",
    input_schema: {
      type: "object",
      properties: { plan_oefening_id: { type: "string" }, nieuwe_oefening_id: { type: "string" }, reden: { type: "string" } },
      required: ["plan_oefening_id", "nieuwe_oefening_id"],
    },
  },
  {
    name: "stel_checkin_voor",
    description: "Stel de wekelijkse check-in voor op basis van wat het lid vertelde. Alleen als er een check-in open staat.",
    input_schema: {
      type: "object",
      properties: {
        zwaarte: { type: "string", enum: ["te_licht", "goed", "te_zwaar"] },
        verloop: { type: "string", enum: ["vlot", "wisselend", "moeilijk"] },
        energie: { type: "string", enum: ["goed", "ok", "laag"] },
        pijn: { type: "boolean" },
        pijn_waar: { type: "string" },
        vrij: { type: "string", description: "Korte samenvatting in de woorden van het lid" },
      },
    },
  },
  {
    name: "stel_coach_voor",
    description: "Stel voor het lid door te verwijzen naar een echte coach van Fittin' (pijn, blessure, medische vraag, of het lid vraagt het).",
    input_schema: { type: "object", properties: { reden: { type: "string" } }, required: ["reden"] },
  },
];

export const LEZEN = new Set(["vrije_momenten", "zoek_oefening", "onthoud"]);
export const VOORSTEL = new Set(GEREEDSCHAP.map((g) => g.name).filter((n) => n.startsWith("stel_")));

// ---- Tijd ------------------------------------------------------------------------------------------------------

const YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" });
export const vandaagBxl = (nu = new Date()) => YMD.format(nu);
/** YYYY-MM-DD + uur (mag .5) → ISO in UTC. */
export const isoVan = (datum, uur) => slotInstant(datum, uur).toISOString();
const plusDagen = (datum, n) => new Date(new Date(`${datum}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const DAGLABEL = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short" });
const hh = (u) => `${String(Math.floor(u)).padStart(2, "0")}:${u % 1 ? "30" : "00"}`;
export const momentLabel = (datum, uur, duur) => `${DAGLABEL.format(new Date(`${datum}T12:00:00Z`))} · ${hh(uur)}–${hh(uur + duur)}`;

// ---- Keuren (puur) ---------------------------------------------------------------------------------------------

/** Vrij = elk halfuur in [uur, uur+duur) staat niet in `bezet` (Set van ms). */
export function isVrij(datum, uur, duur, bezet) {
  for (let s = uur; s < uur + duur - 1e-9; s += 0.5) if (bezet.has(new Date(isoVan(datum, s)).getTime())) return false;
  return true;
}

export function keurMoment({ datum, uur, duur = 1 }, { nu = new Date(), open = 6, dicht = 23 } = {}) {
  if (!DATUM.test(String(datum || ""))) return { fout: "datum moet YYYY-MM-DD zijn" };
  const u = Number(uur), d = Number(duur);
  if (!Number.isInteger(u)) return { fout: "startuur moet een vol uur zijn" };
  if (!DUREN.includes(d)) return { fout: `duur moet ${DUREN.join(", ")} uur zijn` };
  if (u < open || u + d > dicht) return { fout: `de gym is open van ${open}:00 tot ${dicht}:00` };
  const start = new Date(isoVan(datum, u)).getTime();
  if (start < nu.getTime() + 15 * 60000) return { fout: "dat moment is al voorbij of te kort dag" };
  if (start > nu.getTime() + HORIZON_DAGEN * 86400000) return { fout: `boeken kan tot ${HORIZON_DAGEN} dagen vooruit` };
  return { ok: true, datum, uur: u, duur: d, iso: new Date(start).toISOString() };
}

/** Rustig uur? Zelfde regel als slot_promo (0171): vol uur, start én volgend uur rustig. */
export function promoOp(datum, uur, rustig, nu = new Date()) {
  if (!rustig?.aan) return null;
  const per = new Map((rustig.rijen || []).map((r) => [`${r.dow}:${r.hour}`, r]));
  const iso = isoVan(datum, uur);
  const { dow, hour } = dowUur(iso);
  return promoVoor(per.get(`${dow}:${hour}`), per.get(`${dow}:${hour + 1}`), new Date(iso).getTime(), nu.getTime(), { aan: true });
}

export function keurVerplaatsing(invoer, { boekingen = [], ...rest } = {}) {
  const b = boekingen.find((x) => x.id === invoer?.boeking_id);
  if (!b) return { fout: "die boeking bestaat niet of is niet van dit lid" };
  const nu = rest.nu || new Date();
  if (new Date(b.starts_at).getTime() - nu.getTime() < 6 * 3600000) return { fout: "verplaatsen kan tot 6 uur voor de start" };
  const duur = Math.round(((new Date(b.ends_at) - new Date(b.starts_at)) / 3600000) * 2) / 2;
  const m = keurMoment({ datum: invoer.datum, uur: invoer.uur, duur: DUREN.includes(duur) ? duur : 1 }, rest);
  if (m.fout) return m;
  return { ...m, boeking_id: b.id, van: b.starts_at, duur };
}

export function keurWissel(invoer, { planOefeningen = [] } = {}) {
  const po = planOefeningen.find((x) => x.id === invoer?.plan_oefening_id);
  if (!po) return { fout: "die oefening staat niet in het plan van deze week" };
  if (!UUID.test(String(invoer?.nieuwe_oefening_id || ""))) return { fout: "gebruik een id uit zoek_oefening" };
  if (po.exercise_id === invoer.nieuwe_oefening_id) return { fout: "dat is dezelfde oefening" };
  return { ok: true, plan_oefening_id: po.id, van: po.naam, nieuwe_oefening_id: invoer.nieuwe_oefening_id, reden: String(invoer.reden || "").slice(0, 200) };
}

const een = (v, lijst) => (lijst.includes(v) ? v : null);
export function keurCheckin(invoer, { weekId } = {}) {
  if (!weekId) return { fout: "er staat geen check-in open" };
  const c = {
    zwaarte: een(invoer?.zwaarte, ["te_licht", "goed", "te_zwaar"]),
    verloop: een(invoer?.verloop, ["vlot", "wisselend", "moeilijk"]),
    energie: een(invoer?.energie, ["goed", "ok", "laag"]),
    pijn: invoer?.pijn === true,
    pijn_waar: String(invoer?.pijn_waar || "").slice(0, 200) || null,
    vrij: String(invoer?.vrij || "").slice(0, 500) || null,
  };
  if (!c.zwaarte && !c.verloop && !c.energie && !c.vrij) return { fout: "te weinig om in te vullen — vraag eerst hoe de week ging" };
  return { ok: true, weekId, ...c };
}

export function keurCoach(invoer) {
  const reden = String(invoer?.reden || "").replace(/\s+/g, " ").trim().slice(0, 300);
  return reden ? { ok: true, reden } : { fout: "geef een korte reden" };
}

export function keurFeit(feit) {
  const f = String(feit || "").replace(/\s+/g, " ").trim().slice(0, 120);
  return f.length >= 3 ? f : null;
}
/** Nieuw feit achteraan, dubbels weg, hoogstens MAX_FEITEN (de oudste valt eraf). */
export const voegFeitToe = (feiten, f) => [...(feiten || []).filter((x) => x.toLowerCase() !== f.toLowerCase()), f].slice(-MAX_FEITEN);

// ---- Wat het lid op de kaart leest -----------------------------------------------------------------------------

const ZWAARTE = { te_licht: "te licht", goed: "goed", te_zwaar: "te zwaar" };
export function kaartTekst(a) {
  const i = a.invoer || {};
  switch (a.type) {
    case "stel_boeking_voor":
      return { titel: "Sessie boeken", regel: `${momentLabel(i.datum, i.uur, i.duur)}${i.promo ? " · ⚡ rustig uur" : ""}`, knop: "Boek dit moment" };
    case "stel_verplaatsing_voor":
      return { titel: "Sessie verplaatsen", regel: `naar ${momentLabel(i.datum, i.uur, i.duur)}`, knop: "Verplaats" };
    case "stel_oefeningwissel_voor":
      return { titel: "Oefening wisselen", regel: `${i.van} → ${i.naar}`, knop: "Wissel" };
    case "stel_checkin_voor":
      return { titel: "Check-in van deze week", regel: [i.zwaarte && `zwaarte: ${ZWAARTE[i.zwaarte]}`, i.verloop && `verloop: ${i.verloop}`, i.energie && `energie: ${i.energie}`, i.pijn && "pijn gemeld"].filter(Boolean).join(" · ") || "je antwoorden", knop: "Stuur check-in" };
    case "stel_coach_voor":
      return { titel: "Een echte coach vragen", regel: i.reden, knop: "Vraag een coach" };
    default:
      return { titel: "Voorstel", regel: "", knop: "Bevestig" };
  }
}

// ---- Vrije momenten (voor het lezen-gereedschap) ---------------------------------------------------------------

/** Puur: welke volle uren zijn vrij voor `duur`, met ⚡ en of het 2e uur ook vrij is. */
export function vrijeUren({ van, dagen = 3, duur = 1, enkelRustig = false }, { bezet, rustig, nu = new Date(), open = 6, dicht = 23, max = 12 }) {
  const uit = [];
  for (let d = 0; d < Math.min(7, Math.max(1, dagen)); d++) {
    const datum = plusDagen(van, d);
    for (let u = open; u + duur <= dicht && uit.length < max; u++) {
      if (keurMoment({ datum, uur: u, duur }, { nu, open, dicht }).fout) continue;
      if (!isVrij(datum, u, duur, bezet)) continue;
      const promo = promoOp(datum, u, rustig, nu);
      if (enkelRustig && !promo) continue;
      uit.push({ datum, uur: u, promo, tweedeGratis: !!promo && duur < 2 && isVrij(datum, u, 2, bezet) && u + 2 <= dicht });
    }
  }
  return uit;
}

export const betaald = (duur, promo) => betaaldeUren(duur, promo);
