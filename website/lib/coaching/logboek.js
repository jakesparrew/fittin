// Wat heeft de AI-coach allemaal gedaan? Eén chronologische lijn over alle leden heen.
//
// WAAROM ER GEEN GEBEURTENISSEN-TABEL IS. Negen van de tien soorten dragen al een eigen tijdstempel
// én een eigen gym_id: een plan heeft `created_at`, een week `unlocked_at` en `completed_at`, een
// sessie `gedaan_at`, een check-in `created_at`, een menu `created_at`, een mijlpaal `created_at`,
// een modelaanroep `created_at`, een doorverwijzing `doorverwezen_at`. Een logtabel ernaast bewaart
// hetzelfde een tweede keer en loopt gegarandeerd uit de pas met de werkelijkheid — en dan is het
// logboek de leugenaar. Dubbel schrijven is hier duurder dan tien keer lezen.
//
// TWEE DINGEN DIE HIER BEWUST NIET IN STAAN:
//   • De INHOUD van een check-in of een weekmenu. Die zijn van het lid. 0158 geeft coaching_mealweeks
//     bewust geen coachbeleid omdat voeding gevoeliger is dan een schema; datzelfde argument geldt
//     voor een beheerder die niets komt halen maar alles zou zien. Het logboek meldt DAT er een
//     check-in was, niet wat erin stond.
//   • Prompts en modelantwoorden. Wat het lid schreef gaat naar het model omdat het daar nodig is,
//     niet omdat het bewaard moet worden.
//
// ELKE QUERY DRAAGT ZELF `.eq("gym_id", gymId)`. Deze module leest met de service-role, want
// coaching_verbruik heeft rechten voor geen enkele rol behalve service_role — RLS kan hier dus nooit
// vuren. Eén vergeten filter is een stille lees over gyms heen, zonder foutmelding.

import { GELEVERD } from "./budget.js";
import { MIJLPALEN } from "./mijlpalen.js";

const LEEG = "00000000-0000-0000-0000-000000000000";

/**
 * Vaste rangorde binnen hetzelfde tijdstip. Twee klokken lopen door elkaar: coaching_verbruik en
 * coaching_plans krijgen hun stempel van Postgres (`now()`), terwijl unlocked_at, gedaan_at en
 * doorverwezen_at uit de Node-runtime komen (`new Date().toISOString()`). Zonder tiebreak wisselt
 * de volgorde van twee gebeurtenissen in dezelfde seconde bij elke herlading.
 */
const RANG = {
  plan: 0, aanroep: 1, geweigerd: 2, week_open: 3, menu: 4,
  sessie: 5, checkin: 6, mijlpaal: 7, week_af: 8, doorverwezen: 9, plan_af: 10,
};

/** Is deze modelaanroep geld dat wegging zonder dat er iets uitkwam? */
export function isProbleem(rij) {
  if (rij.soort === "geweigerd") return true;
  if (!rij.ok) return true;
  if (rij.resultaat == null) return false;   // van vóór 0161 — onbekend, niet fout
  return !GELEVERD.has(rij.resultaat);
}

/** Leesbare uitleg bij een uitkomst. Onbekende waarden komen ongewijzigd door. */
export function resultaatTekst(resultaat) {
  return {
    plan_geschreven: "plan geschreven",
    zin_geschreven: "weekzin geschreven",
    menu_geschreven: "menu geschreven",
    gateway_faalde: "de gateway antwoordde niet",
    sleutel_ongeldig: "de gateway weigerde de sleutel (401) — zet COACH_AI_GATEWAY_KEY goed op Vercel",
    json_onleesbaar: "antwoord was onleesbaar",
    geen_oefeningen: "geen oefeningen gevonden",
    afgekeurd: "voorschriften afgekeurd",
    opslag_faalde: "opslaan mislukte",
  }[resultaat] || resultaat || null;
}

/**
 * De hele stroom, nieuwste eerst.
 *
 * @param {object} o
 * @param {string} o.gymId
 * @param {number} o.dagen      hoe ver terug
 * @param {string} [o.memberId] beperk tot één lid
 * @returns {Promise<{regels: object[], namen: Map, telling: object}>}
 */
export async function logboekVoor(admin, { gymId, dagen = 30, memberId = null }) {
  const vanaf = new Date(Date.now() - dagen * 86400000).toISOString();
  const perLid = (q) => (memberId ? q.eq("member_id", memberId) : q);

  const [plannenR, verbruikR, menusR, mijlpalenR, checkinsR] = await Promise.all([
    perLid(admin.from("coaching_plans")
      .select("id, member_id, doel, weken, status, created_at, afgerond_at, doorverwezen_at, doorverwijs_reden")
      .eq("gym_id", gymId)),
    perLid(admin.from("coaching_verbruik")
      .select("id, member_id, soort, model, in_tokens, uit_tokens, kost_micro, ok, fout, resultaat, created_at")
      .eq("gym_id", gymId).gte("created_at", vanaf)),
    perLid(admin.from("coaching_mealweeks")
      .select("id, member_id, weeknummer, created_at").eq("gym_id", gymId).gte("created_at", vanaf)),
    perLid(admin.from("coaching_mijlpalen")
      .select("id, member_id, soort, created_at").eq("gym_id", gymId).gte("created_at", vanaf)),
    admin.from("coaching_checkins")
      .select("id, week_id, created_at").eq("gym_id", gymId).gte("created_at", vanaf),
  ]);

  const plannen = plannenR.data || [];
  const planIds = plannen.map((p) => p.id);
  const planVanLid = new Map(plannen.map((p) => [p.id, p.member_id]));

  // Weken en sessies hangen aan een plan, niet rechtstreeks aan een lid — vandaar de omweg.
  const { data: weken } = planIds.length
    ? await admin.from("coaching_weeks")
        .select("id, plan_id, weeknummer, unlocked_at, completed_at, besluit").in("plan_id", planIds)
    : { data: [] };
  const weekIds = (weken || []).map((w) => w.id);
  const { data: sessies } = weekIds.length
    ? await admin.from("coaching_sessions")
        .select("id, week_id, volgnummer, gedaan_at, oordeel").in("week_id", weekIds).not("gedaan_at", "is", null)
    : { data: [] };

  const lidVanWeek = new Map((weken || []).map((w) => [w.id, planVanLid.get(w.plan_id)]));
  const nrVanWeek = new Map((weken || []).map((w) => [w.id, w.weeknummer]));

  const regels = [];
  const bij = (soort, tijd, memberId_, rest) => {
    if (!tijd || tijd < vanaf) return;
    if (memberId && memberId_ !== memberId) return;
    regels.push({ soort, tijd, memberId: memberId_, rang: RANG[soort] ?? 99, ...rest });
  };

  for (const p of plannen) {
    bij("plan", p.created_at, p.member_id, { weken: p.weken, doel: p.doel });
    bij("plan_af", p.afgerond_at, p.member_id, { weken: p.weken });
    bij("doorverwezen", p.doorverwezen_at, p.member_id, { reden: p.doorverwijs_reden });
  }
  for (const w of weken || []) {
    bij("week_open", w.unlocked_at, planVanLid.get(w.plan_id), { weeknummer: w.weeknummer, besluit: w.besluit });
    bij("week_af", w.completed_at, planVanLid.get(w.plan_id), { weeknummer: w.weeknummer });
  }
  for (const s of sessies || []) {
    bij("sessie", s.gedaan_at, lidVanWeek.get(s.week_id), { volgnummer: s.volgnummer, oordeel: s.oordeel, weeknummer: nrVanWeek.get(s.week_id) });
  }
  for (const c of checkinsR.data || []) {
    bij("checkin", c.created_at, lidVanWeek.get(c.week_id), { weeknummer: nrVanWeek.get(c.week_id) });
  }
  for (const m of menusR.data || []) bij("menu", m.created_at, m.member_id, { weeknummer: m.weeknummer });
  for (const m of mijlpalenR.data || []) {
    bij("mijlpaal", m.created_at, m.member_id, { titel: MIJLPALEN[m.soort]?.titel || m.soort });
  }
  for (const v of verbruikR.data || []) {
    bij(v.soort === "geweigerd" ? "geweigerd" : "aanroep", v.created_at, v.member_id, {
      aanroepSoort: v.soort, model: v.model, inTokens: v.in_tokens, uitTokens: v.uit_tokens,
      micro: v.kost_micro, ok: v.ok, fout: v.fout, resultaat: v.resultaat, probleem: isProbleem(v),
    });
  }

  regels.sort((a, b) => (a.tijd === b.tijd ? a.rang - b.rang : (a.tijd < b.tijd ? 1 : -1)));

  // De namen erbij. Eén query, en bewust alleen naam en e-mail: gezondheidsvelden hebben hier
  // niets te zoeken, ook niet "omdat ze toch al opgehaald worden".
  const ids = [...new Set(regels.map((r) => r.memberId).filter(Boolean))];
  const { data: leden } = ids.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", ids.length ? ids : [LEEG])
    : { data: [] };

  const verbruik = verbruikR.data || [];
  return {
    regels,
    namen: new Map((leden || []).map((l) => [l.id, l.full_name || l.email || "Onbekend lid"])),
    telling: {
      gebeurtenissen: regels.length,
      micro: verbruik.filter((v) => v.soort !== "geweigerd").reduce((n, v) => n + (v.kost_micro || 0), 0),
      uitTokens: verbruik.reduce((n, v) => n + (v.uit_tokens || 0), 0),
      problemen: verbruik.filter(isProbleem).length,
      problemenMicro: verbruik.filter(isProbleem).reduce((n, v) => n + (v.kost_micro || 0), 0),
      onbekend: verbruik.filter((v) => v.soort !== "geweigerd" && v.resultaat == null).length,
    },
  };
}

/** Groepeert de stroom per kalenderdag in Brussel, nieuwste dag eerst. */
export function perDag(regels) {
  const dagen = new Map();
  for (const r of regels) {
    const dag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(r.tijd));
    if (!dagen.has(dag)) dagen.set(dag, { dag, regels: [], micro: 0, aanroepen: 0 });
    const d = dagen.get(dag);
    d.regels.push(r);
    if (r.soort === "aanroep") { d.micro += r.micro || 0; d.aanroepen++; }
  }
  return [...dagen.values()];
}
