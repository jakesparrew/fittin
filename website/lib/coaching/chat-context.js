// Wat de coach-chat over het lid weet. Eén lader voor de route (model) en de serveracties (keuren bij uitvoeren).
//
// Privacy (zie privacy-pagina punt 3 en prompt.js): GEEN naam, e-mail, telefoon, adres of geboortedatum naar het
// model. Lichaamsgegevens alleen met `coaching_toestemming_at` — via dezelfde bouwContext als het plan. De naam
// gebruiken we enkel in de opening, die de server zelf schrijft en die nooit naar het model gaat.

import { dossierVoor } from "./plan.js";
import { bouwContext, contextTekst } from "./prompt.js";
import { laadRustigeUren, korteStatus } from "../punten-db.js";
import { vandaagBxl, momentLabel, vrijeUren, keurMoment, isVrij, promoOp, keurVerplaatsing, keurWissel, keurCheckin, keurCoach, keurFeit, voegFeitToe, isoVan, betaald } from "./chat-tools.js";

const TIJD = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const DAG = 86400000;

export async function laadLid(admin, supabase, profiel, nu = new Date()) {
  const id = profiel.id;
  const gymId = profiel.gym_id;
  const [{ data: gym }, { data: boek }, credits, dossier, rustig, { data: geh }, status] = await Promise.all([
    admin.from("gyms").select("open_hour, close_hour").eq("id", gymId).maybeSingle(),
    admin.from("bookings").select("id, starts_at, ends_at, promo, coach_id")
      .eq("user_id", id).eq("status", "bevestigd").gte("starts_at", new Date(nu.getTime() - 30 * DAG).toISOString())
      .order("starts_at").limit(60),
    supabase.rpc("credits_balance", { p_user: id }).then((r) => Number(r.data) || 0, () => 0),
    dossierVoor(admin, id).catch(() => ({ plan: null })),
    laadRustigeUren(admin, gymId).catch(() => ({ aan: false, rijen: [] })),
    admin.from("coach_geheugen").select("feiten").eq("member_id", id).maybeSingle(),
    korteStatus(admin, id, gymId).catch(() => ""),
  ]);
  const open = gym?.open_hour ?? 6, dicht = gym?.close_hour ?? 23;
  const alle = boek || [];
  const komend = alle.filter((b) => new Date(b.starts_at) > nu);
  const gedaan30 = alle.filter((b) => new Date(b.ends_at) <= nu).length;
  const feiten = geh?.feiten || [];

  // Het plan van deze week: sessies, oefeningen (met plan-id's voor een wissel) en of de check-in openstaat.
  const plan = dossier?.plan || null;
  const week = dossier?.open || null;
  const sessies = dossier?.sessies || [];
  const planOefeningen = (dossier?.oefeningen || []).map((o) => ({
    id: o.id, exercise_id: o.exercises?.id, naam: o.exercises?.name || "oefening", dag: o.dag?.name || `dag ${o.dag?.day_no ?? "?"}`,
    sets: o.sets, reps: o.reps, kg: o.target_weight_kg,
  }));
  const weekStart = week?.unlocked_at ? new Date(week.unlocked_at).getTime() : null;
  const geboektDezeWeek = weekStart ? komend.filter((b) => new Date(b.starts_at).getTime() < weekStart + 7 * DAG).length : 0;
  const dagenOpen = weekStart ? (nu.getTime() - weekStart) / DAG : 0;
  const checkinOpen = !!week && !dossier?.checkin && dagenOpen >= 5;

  // Drie rustige momenten om voor te stellen (zelfde regel als de boekingspagina).
  const bezet = new Set(); // enkel ter indicatie; vrije_momenten kijkt echt in het rooster
  const rustigVoorstel = vrijeUren({ van: vandaagBxl(nu), dagen: 7, duur: 1, enkelRustig: true }, { bezet, rustig, nu, open, dicht, max: 3 });

  const r = [];
  r.push(`Tegoed: ${credits} sessie${credits === 1 ? "" : "s"}${credits >= 1 ? " (boeken kan dus zonder betalen)" : " (boeken = betalen via de betaalpagina, €15/uur)"}`);
  r.push(`Sessies de laatste 30 dagen: ${gedaan30}`);
  if (status) r.push(`Punten & reeks: ${status}`);
  r.push(komend.length
    ? `Komende boekingen:\n${komend.slice(0, 8).map((b) => `- id ${b.id}: ${TIJD.format(new Date(b.starts_at))}–${TIJD.format(new Date(b.ends_at)).slice(-5)}${b.promo ? " ⚡" : ""}${b.coach_id ? " (met coach)" : ""}`).join("\n")}`
    : "Komende boekingen: geen");
  if (rustigVoorstel.length) r.push(`Rustige uren (⚡) de komende week, o.a.: ${rustigVoorstel.map((m) => momentLabel(m.datum, m.uur, 1)).join(", ")} — check met vrije_momenten of ze nog vrij zijn.`);

  if (plan && profiel.coaching_doel) {
    r.push(`\nProfiel voor training:\n${contextTekst(bouwContext(profiel, { nu }))}`);
    r.push(`Coachingplan: week ${week?.weeknummer ?? "?"} van ${plan.weken}${plan.status === "gepauzeerd" ? " (GEPAUZEERD)" : ""}. Deze week ${sessies.filter((s) => s.gedaan_at).length} van ${sessies.length} sessies afgevinkt, ${geboektDezeWeek} geboekt.`);
    if (planOefeningen.length) {
      r.push(`Oefeningen deze week (plan-id · dag · oefening · sets×reps):\n${planOefeningen.slice(0, 30).map((o) => `- ${o.id} · ${o.dag} · ${o.naam} · ${o.sets ?? "?"}×${o.reps ?? "?"}${o.kg ? ` @ ${o.kg} kg` : ""}`).join("\n")}`);
    }
    r.push(checkinOpen ? "De wekelijkse check-in staat OPEN (nog niet ingevuld)." : dossier?.checkin ? "De check-in van deze week is al ingevuld." : "Check-in: nog niet aan de orde.");
  } else {
    r.push("\nDit lid heeft (nog) geen coachingplan. Een plan maken gebeurt op de coachingpagina (intake van 2 minuten) — verwijs daarheen als het lid een schema wil.");
  }
  if (feiten.length) r.push(`\nWat je eerder onthield:\n${feiten.map((f) => `- ${f}`).join("\n")}`);

  return {
    tekst: r.join("\n"),
    open, dicht, rustig, credits, feiten,
    komend, planOefeningen, weekId: week && !dossier?.checkin ? week.id : null,
    welkom: profiel.welcome_status === "eligible" && !profiel.welcome_code_used,
    opening: {
      naam: String(profiel.full_name || "").split(" ")[0] || null,
      plan: plan ? { gepland: sessies.length, gedaan: sessies.filter((s) => s.gedaan_at).length, geboektDezeWeek, checkinOpen } : null,
      volgende: komend[0]?.starts_at || null,
      rustig: rustigVoorstel[0] ? true : null,
    },
  };
}

// ---- Server-kant van het gereedschap -----------------------------------------------------------------------------

/** Bezette halfuren (ms) tussen twee momenten. Via de sessie-client: gym_taken_slots is voor anon/authenticated. */
export async function bezet(supabase, gymId, vanIso, totIso) {
  const { data } = await supabase.rpc("gym_taken_slots", { p_gym: gymId, p_from: vanIso, p_to: totIso });
  return new Set((data || []).map((r) => new Date(r.starts_at).getTime()));
}

function dagRange(datum, dagen = 1) {
  const a = isoVan(datum, 0);
  return [a, new Date(new Date(a).getTime() + dagen * DAG).toISOString()];
}

/**
 * Keurt een voorstel tegen de echte toestand. Dezelfde functie bij het voorstellen (route) en bij het uitvoeren
 * (serveractie): wat er intussen veranderde, wordt zo toch nog geweigerd.
 * @returns {{ok:true, invoer:object} | {fout:string}}
 */
export async function keurVoorstel({ admin, supabase, profiel, lid, nu = new Date() }, type, invoer) {
  const ramen = { nu, open: lid.open, dicht: lid.dicht };
  if (type === "stel_boeking_voor") {
    const m = keurMoment(invoer, ramen);
    if (m.fout) return m;
    const [van, tot] = dagRange(m.datum);
    if (!isVrij(m.datum, m.uur, m.duur, await bezet(supabase, profiel.gym_id, van, tot))) return { fout: "dat moment is niet (meer) vrij" };
    if (lid.komend.some((b) => new Date(b.starts_at) < new Date(new Date(m.iso).getTime() + m.duur * 3600000) && new Date(b.ends_at) > new Date(m.iso))) return { fout: "het lid heeft dan al een boeking" };
    const promo = promoOp(m.datum, m.uur, lid.rustig, nu);
    const uren = lid.welkom && m.duur === 1 ? 0 : betaald(m.duur, promo);
    return { ok: true, invoer: { datum: m.datum, uur: m.uur, duur: m.duur, promo, uren, metTegoed: uren > 0 && lid.credits >= uren, welkom: lid.welkom && m.duur === 1 } };
  }
  if (type === "stel_verplaatsing_voor") {
    const m = keurVerplaatsing(invoer, { ...ramen, boekingen: lid.komend });
    if (m.fout) return m;
    const [van, tot] = dagRange(m.datum);
    const vrij = await bezet(supabase, profiel.gym_id, van, tot);
    // Het eigen oude moment telt niet als bezet (verplaatsen binnen dezelfde dag, een half uur opschuiven).
    const eigen = new Date(m.van).getTime();
    for (let x = eigen; x < eigen + m.duur * 3600000; x += 1800000) vrij.delete(x);
    if (!isVrij(m.datum, m.uur, m.duur, vrij)) return { fout: "dat moment is niet (meer) vrij" };
    return { ok: true, invoer: { boeking_id: m.boeking_id, van: m.van, datum: m.datum, uur: m.uur, duur: m.duur } };
  }
  if (type === "stel_oefeningwissel_voor") {
    const w = keurWissel(invoer, { planOefeningen: lid.planOefeningen });
    if (w.fout) return w;
    const { data: ex } = await admin.from("exercises").select("id, name").eq("id", w.nieuwe_oefening_id).eq("gym_id", profiel.gym_id).is("coach_id", null).maybeSingle();
    if (!ex) return { fout: "die oefening bestaat niet in de bibliotheek — gebruik zoek_oefening" };
    return { ok: true, invoer: { plan_oefening_id: w.plan_oefening_id, van: w.van, nieuwe_oefening_id: ex.id, naar: ex.name, reden: w.reden } };
  }
  if (type === "stel_checkin_voor") {
    const c = keurCheckin(invoer, { weekId: lid.weekId });
    return c.fout ? c : { ok: true, invoer: c };
  }
  if (type === "stel_coach_voor") {
    const c = keurCoach(invoer);
    return c.fout ? c : { ok: true, invoer: { reden: c.reden } };
  }
  return { fout: "onbekend voorstel" };
}

/** Het lezen-gereedschap. Geeft altijd tekst terug voor het model — ook bij een fout. */
export async function voerLezenUit({ admin, supabase, profiel, lid, nu = new Date() }, naam, invoer) {
  if (naam === "vrije_momenten") {
    const van = /^\d{4}-\d{2}-\d{2}$/.test(String(invoer?.van || "")) ? invoer.van : vandaagBxl(nu);
    const dagen = Math.min(7, Math.max(1, Number(invoer?.dagen) || 3));
    const duur = [1, 1.5, 2, 3].includes(Number(invoer?.duur)) ? Number(invoer.duur) : 1;
    const [a] = dagRange(van), [, b] = dagRange(van, dagen);
    const vrij = vrijeUren({ van, dagen, duur, enkelRustig: !!invoer?.enkel_rustig }, { bezet: await bezet(supabase, profiel.gym_id, a, b), rustig: lid.rustig, nu, open: lid.open, dicht: lid.dicht, max: 14 });
    if (!vrij.length) return "Geen vrije momenten gevonden in die periode.";
    return vrij.map((m) => `${m.datum} ${String(m.uur).padStart(2, "0")}:00 (${momentLabel(m.datum, m.uur, duur)})${m.promo ? ` ⚡${m.tweedeGratis ? " — 2e uur gratis mogelijk" : ""}` : ""}`).join("\n");
  }
  if (naam === "zoek_oefening") {
    const q = String(invoer?.zoek || "").replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
    if (q.length < 2) return "Geef een zoekterm.";
    const { data } = await admin.from("exercises").select("id, name, primary_muscles, equipment, difficulty")
      .eq("gym_id", profiel.gym_id).is("coach_id", null).or(`name.ilike.%${q}%,primary_muscles.cs.{${q.toLowerCase()}}`).limit(8);
    if (!data?.length) return `Niets gevonden voor "${q}".`;
    return data.map((e) => `${e.id} · ${e.name} · ${(e.primary_muscles || []).join(", ")} · ${e.equipment || "-"} · ${e.difficulty || "-"}`).join("\n");
  }
  if (naam === "onthoud") {
    const f = keurFeit(invoer?.feit);
    if (!f) return "Te kort om te onthouden.";
    const feiten = voegFeitToe(lid.feiten, f);
    const { error } = await admin.from("coach_geheugen").upsert({ member_id: profiel.id, gym_id: profiel.gym_id, feiten, updated_at: nu.toISOString() }, { onConflict: "member_id" });
    if (error) return "Onthouden lukte niet.";
    lid.feiten = feiten;
    return "Onthouden.";
  }
  return "Onbekend gereedschap.";
}
