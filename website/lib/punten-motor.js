// De puntenmotor — draait elk uur (/api/cron/punten). Alles is idempotent: elke rij heeft een unieke bron-sleutel,
// dus een run die twee keer loopt of een uur overslaat, levert exact hetzelfde puntenboek op.
//
// Wat hier gebeurt, per gym:
//   1. sessies en meetrainers (na afloop) — met dubbele punten op een rustig uur
//   2. correcties voor sessies die intussen geannuleerd of terugbetaald zijn
//   3. weken en reeksen (afgesloten weken)
//   4. starter-quest, groei (gasten, vrienden), klant (abo, kaart), training (log, gewicht, rating), AI-coach, events
//   5. badges (+ de gratis sessie bij Ambassadeur ★★★ en 👑, uit het aanbrengbudget)
//   6. maandelijks: scorebord en gymdoel van vorige maand
//   7. verval van punten na 12 maanden zonder sessie
//   8. de feed: posts bij VOLTOOIDE sessies (0165 haalde de trigger bij het boeken weg)
//   9. één keer per nacht: de rustige uren herberekenen
//
// Enkel leden (role 'lid') verdienen punten. Coaches en beheerders niet — zoals op het klassement.
// Niets vóór gamification_settings.gestart_op levert punten op (geen terugwerkende kracht, beslissing 2026-09-18).

import {
  waarde, bereken, tellers, isoWeek, reeks, questStatus, klasseVan, dowUur, klassement, gymdoel, dagBxl,
} from "./punten.js";
import { nieuweBadges, sessieStats, BADGE, BADGE_MET_SESSIE } from "./badges.js";
import { alles, schrijfPunten, meldVooruitgang, beginMaand, maandSleutel } from "./punten-db.js";
import { isSettled } from "./booking-status.js";
import { notify } from "./notify.js";

const DAG = 86400000;
const MIJLPALEN = new Set([1, 10, 25, 50, 100, 150, 200, 250, 300]);

export async function draaiPuntenmotor(admin, { nu = new Date() } = {}) {
  const { data: sets } = await admin.from("gamification_settings").select("*").eq("aan", true);
  const verslag = [];
  for (const s of sets || []) {
    try { verslag.push({ gym: s.gym_id, ...(await perGym(admin, s, nu)) }); }
    catch (e) { console.error("puntenmotor:", s.gym_id, e?.message); verslag.push({ gym: s.gym_id, fout: e?.message }); }
  }
  return verslag;
}

async function perGym(admin, s, nu) {
  const gym = s.gym_id;
  const t = nu.getTime();
  const start = new Date(s.gestart_op).getTime();
  const na = (iso) => iso && new Date(iso).getTime() >= start;
  const verleden = (iso) => iso && new Date(iso).getTime() <= t;
  const iso = (ms) => new Date(ms).toISOString();

  // ---------- lezen ----------
  const [profielen, ledger, boekingen, deelnemers, invites, referrals, memberships, betalingen, logs, metingen, ratings,
    checks, plannen, csessies, checkins, mijlpalen, events, signups, badgesAl, credAmb] = await Promise.all([
    alles(() => admin.from("profiles").select("id, role, full_name, is_test, streak_target, created_at, coaching_doel, hoe_gevonden").eq("gym_id", gym)),
    alles(() => admin.from("member_points").select("id, user_id, kind, points, source_key, meta, created_at").eq("gym_id", gym)),
    alles(() => admin.from("bookings").select("id, user_id, coach_id, starts_at, ends_at, status, paid, price_cents, payment_source, promo, created_at, netjes_verklaard_at").eq("gym_id", gym)),
    alles(() => admin.from("booking_participants").select("id, booking_id, user_id, confirmed_at").eq("gym_id", gym)),
    alles(() => admin.from("email_invites").select("id, booking_id, inviter_id, email, confirmed_at").eq("gym_id", gym)),
    alles(() => admin.from("referrals").select("id, referrer_id, referred_id, created_at").eq("gym_id", gym)),
    alles(() => admin.from("memberships").select("id, user_id, started_at").eq("gym_id", gym)),
    alles(() => admin.from("payments").select("id, user_id, kind, status, amount_cents, created_at").eq("gym_id", gym).in("kind", ["abonnement", "beurtenkaart"])),
    alles(() => admin.from("workout_logs").select("id, user_id, logged_on, created_at").eq("gym_id", gym)),
    alles(() => admin.from("body_metrics").select("id, user_id, created_at").eq("gym_id", gym)),
    alles(() => admin.from("session_feedback").select("booking_id, user_id, created_at").eq("gym_id", gym)),
    alles(() => admin.from("zaal_checks").select("booking_id, user_id, photo_path, owner_verdict, created_at").eq("gym_id", gym)),
    alles(() => admin.from("coaching_plans").select("id, member_id, status, afgerond_at, created_at").eq("gym_id", gym)),
    alles(() => admin.from("coaching_sessions").select("id, gedaan_at, week:coaching_weeks(plan:coaching_plans(member_id))").eq("gym_id", gym).not("gedaan_at", "is", null)),
    alles(() => admin.from("coaching_checkins").select("id, created_at, week:coaching_weeks(plan:coaching_plans(member_id))").eq("gym_id", gym)),
    alles(() => admin.from("coaching_mijlpalen").select("id, member_id, created_at").eq("gym_id", gym)),
    alles(() => admin.from("events").select("id, starts_at, ends_at").eq("gym_id", gym)),
    alles(() => admin.from("event_signups").select("event_id, user_id").eq("gym_id", gym)),
    alles(() => admin.from("member_badges").select("user_id, badge").eq("gym_id", gym)),
    alles(() => admin.from("credits_ledger").select("ref_id, created_at").eq("gym_id", gym).eq("reason", "ambassadeur")),
  ]);

  const lid = new Map(profielen.filter((p) => p.role === "lid").map((p) => [p.id, p]));
  const isLid = (id) => lid.has(id);
  const bestaat = new Set(ledger.map((r) => r.source_key));
  const perLid = new Map();
  for (const r of ledger) { if (!perLid.has(r.user_id)) perLid.set(r.user_id, []); perLid.get(r.user_id).push(r); }
  const lifetime = (id) => tellers(perLid.get(id) || []).lifetime;

  const rijen = [];
  const geef = (userId, kind, key, sourceKey, { rustig = false, meta = {}, vast = null } = {}) => {
    if (!isLid(userId) || bestaat.has(sourceKey)) return;
    const basis = vast ?? waarde(s, key);
    if (!(basis > 0)) return;
    const points = vast != null ? vast : bereken(basis, { lifetime: lifetime(userId), rustig, settings: s });
    rijen.push({ gym_id: gym, user_id: userId, kind, points, source_key: sourceKey, meta: { ...meta, basis } });
    bestaat.add(sourceKey);
  };

  // ---------- 1. sessies ----------
  const bk = new Map(boekingen.map((b) => [b.id, b]));
  // Voltooid = bevestigd, voorbij, en betaald (of gratis/tegoed). Een onbetaalde sessie kreeg geen deurcode.
  const voltooid = boekingen.filter((b) => b.status === "bevestigd" && verleden(b.ends_at) && isSettled(b));
  // Alle voltooide sessies per lid (eigen + bevestigd meegekomen), oplopend — voor quest, weken en badges.
  const sessiesVan = new Map();
  const voegToe = (uid, b) => { if (!sessiesVan.has(uid)) sessiesVan.set(uid, []); sessiesVan.get(uid).push(b); };
  for (const b of voltooid) voegToe(b.user_id, b);
  for (const p of deelnemers) {
    const b = bk.get(p.booking_id);
    if (p.confirmed_at && b && b.status === "bevestigd" && verleden(b.ends_at) && isSettled(b) && p.user_id !== b.user_id) voegToe(p.user_id, b);
  }
  for (const l of sessiesVan.values()) l.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  for (const b of voltooid) {
    if (!na(b.ends_at)) continue;
    geef(b.user_id, "sessie", "sessie", `sessie:${b.id}:${b.user_id}`, { rustig: b.promo === "rustig", meta: { booking: b.id } });
  }
  // Meetrainen telt enkel als de gast zelf bevestigde ("Ik kom") — anders boek je voor 4 en zet je 3 namen erbij.
  for (const p of deelnemers) {
    const b = bk.get(p.booking_id);
    if (!p.confirmed_at || !b || b.status !== "bevestigd" || !isSettled(b) || !verleden(b.ends_at) || !na(b.ends_at) || p.user_id === b.user_id) continue;
    geef(p.user_id, "deelnemer", "deelnemer", `deelnemer:${p.user_id}:${dagBxl(b.starts_at)}`, { meta: { booking: b.id } });
  }

  // ---------- 2. correcties ----------
  for (const r of ledger) {
    if (!["sessie", "deelnemer"].includes(r.kind) || r.points <= 0) continue;
    const b = bk.get(r.meta?.booking);
    if (b && b.status === "bevestigd") continue;
    const key = `correctie:${r.source_key}`;
    if (bestaat.has(key)) continue;
    rijen.push({ gym_id: gym, user_id: r.user_id, kind: "correctie", points: -r.points, source_key: key, meta: { van: r.source_key, reden: "sessie geannuleerd of terugbetaald" } });
    bestaat.add(key);
  }
  for (const r of ledger) {
    if (r.kind !== "kaart" && r.kind !== "abo_maand") continue;
    const pay = betalingen.find((p) => p.id === r.meta?.payment);
    if (!pay || pay.status === "betaald") continue;
    const key = `correctie:${r.source_key}`;
    if (bestaat.has(key)) continue;
    rijen.push({ gym_id: gym, user_id: r.user_id, kind: "correctie", points: -r.points, source_key: key, meta: { van: r.source_key, reden: "betaling teruggestort" } });
    bestaat.add(key);
  }

  // ---------- 3. weken en reeksen ----------
  const dezeWeek = isoWeek(iso(t));
  const startWeek = isoWeek(iso(start));
  const gehaaldVan = new Map();
  for (const [uid, l] of sessiesVan) {
    if (!isLid(uid)) continue;
    const doel = Math.min(4, Math.max(1, lid.get(uid).streak_target || 1));
    const perWeek = new Map();
    for (const b of l) {
      if (!na(b.starts_at)) continue;
      const w = isoWeek(b.starts_at);
      perWeek.set(w, (perWeek.get(w) || 0) + 1);
    }
    const gehaald = new Set([...perWeek.entries()].filter(([w, n]) => n >= doel && w !== dezeWeek && w >= startWeek).map(([w]) => w));
    gehaaldVan.set(uid, gehaald);
    for (const w of [...gehaald].sort()) {
      geef(uid, "week", "week", `week:${uid}:${w}`, { meta: { week: w, doel } });
      const r = reeks(gehaald, w);
      if (r.lengte > 0 && r.lengte % 4 === 0) geef(uid, "reeks4", "reeks4", `reeks4:${uid}:${w}`, { meta: { week: w, lengte: r.lengte } });
    }
  }

  // ---------- 4a. starter-quest ----------
  const eersteBoeking = new Map();
  for (const b of boekingen) {
    if (b.status === "geannuleerd") continue;
    const k = eersteBoeking.get(b.user_id);
    if (!k || b.created_at < k) eersteBoeking.set(b.user_id, b.created_at);
  }
  for (const uid of lid.keys()) {
    const q = questStatus({ sessies: sessiesVan.get(uid) || [], geboektOp: eersteBoeking.get(uid) || null, gestartOp: s.gestart_op });
    for (const stap of q) {
      if (!["boek", "eerste", "tweede", "derde"].includes(stap.id) || !stap.punten) continue;
      geef(uid, "quest", stap.key, `quest:${stap.id}:${uid}`, { meta: { stap: stap.id } });
    }
  }

  // ---------- 4b. groei ----------
  for (const p of deelnemers) {
    const b = bk.get(p.booking_id);
    if (p.confirmed_at && na(p.confirmed_at) && b && p.user_id !== b.user_id) geef(b.user_id, "gast_bevestigd", "gast_bevestigd", `gastbev:p:${p.id}`, { meta: { booking: b.id } });
  }
  for (const i of invites) {
    if (i.confirmed_at && na(i.confirmed_at)) geef(i.inviter_id, "gast_bevestigd", "gast_bevestigd", `gastbev:i:${i.id}`, { meta: { booking: i.booking_id } });
  }
  const betaaldeSessie = (b) => b.status === "bevestigd" && ["los", "abo", "credit"].includes(b.payment_source) && (b.paid || b.payment_source === "credit") && (b.price_cents > 0 || b.payment_source === "credit");
  const maandStart = new Date(beginMaand(nu)).getTime();
  for (const r of referrals) {
    if (!r.referrer_id || !r.referred_id) continue;
    if (na(r.created_at)) geef(r.referrer_id, "gast_account", "gast_account", `gastacc:${r.id}`, { meta: { vriend: r.referred_id } });
    const eerste = voltooid.filter((b) => b.user_id === r.referred_id && betaaldeSessie(b)).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
    if (eerste && na(eerste.ends_at)) {
      geef(r.referrer_id, "vriend_eerste", "vriend_eerste", `vriend1:${r.id}`, { meta: { vriend: r.referred_id, booking: eerste.id } });
      geef(r.referred_id, "vriend_eerste_zelf", "vriend_eerste_zelf", `vriend1zelf:${r.id}`, { meta: { via: r.referrer_id } });
    }
    const abo = memberships.filter((m) => m.user_id === r.referred_id).sort((a, b) => new Date(a.started_at) - new Date(b.started_at))[0];
    const kaart = betalingen.filter((p) => p.user_id === r.referred_id && p.kind === "beurtenkaart" && p.status === "betaald" && p.amount_cents > 0).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
    const klantOp = [abo?.started_at, kaart?.created_at].filter(Boolean).sort()[0];
    if (klantOp && na(klantOp)) geef(r.referrer_id, "vriend_abo", "vriend_abo", `vriendabo:${r.id}`, { meta: { vriend: r.referred_id } });
  }
  // Wie werd omgezet, telt uit het boek (na deze ronde): vriend_eerste-rijen.
  const omgezet = new Map();
  for (const r of [...ledger, ...rijen]) {
    if (r.kind !== "vriend_eerste") continue;
    omgezet.set(r.user_id, (omgezet.get(r.user_id) || 0) + 1);
  }

  // ---------- 4c. klant ----------
  const eersteAbo = new Map();
  for (const m of memberships) {
    const k = eersteAbo.get(m.user_id);
    if (m.started_at && (!k || m.started_at < k)) eersteAbo.set(m.user_id, m.started_at);
  }
  for (const [uid, op] of eersteAbo) if (na(op)) geef(uid, "abo_start", "abo_start", `abostart:${uid}`);
  for (const p of betalingen) {
    if (p.status !== "betaald" || !(p.amount_cents > 0) || !na(p.created_at)) continue;
    if (p.kind === "abonnement") geef(p.user_id, "abo_maand", "abo_maand", `abomaand:${p.id}`, { meta: { payment: p.id } });
    if (p.kind === "beurtenkaart") geef(p.user_id, "kaart", "kaart", `kaart:${p.id}`, { meta: { payment: p.id } });
  }

  // ---------- 4d. training en ervaring ----------
  for (const l of logs) if (na(l.created_at)) geef(l.user_id, "log", "log", `log:${l.user_id}:${l.logged_on || dagBxl(l.created_at)}`);
  for (const m of metingen) if (na(m.created_at)) geef(m.user_id, "gewicht", "gewicht", `gewicht:${m.user_id}:${isoWeek(m.created_at)}`);
  for (const r of ratings) if (na(r.created_at) && r.user_id) geef(r.user_id, "rating", "rating", `rating:${r.booking_id}`, { meta: { booking: r.booking_id } });
  for (const c of checks) {
    if (!na(c.created_at)) continue;
    geef(c.user_id, "zaalcheck", "zaalcheck", `zaalcheck:${c.booking_id}`, { meta: { booking: c.booking_id } });
    if (c.photo_path) geef(c.user_id, "zaalfoto", "zaalfoto", `zaalfoto:${c.booking_id}`, { meta: { booking: c.booking_id } });
  }
  for (const b of boekingen) {
    if (b.netjes_verklaard_at && na(b.netjes_verklaard_at)) geef(b.user_id, "netjes", "netjes", `netjes:${b.id}`, { meta: { booking: b.id } });
  }

  // ---------- 4e. AI-coach ----------
  const eerstePlan = new Map();
  for (const p of plannen) { const k = eerstePlan.get(p.member_id); if (!k || p.created_at < k.created_at) eerstePlan.set(p.member_id, p); }
  for (const [uid, p] of eerstePlan) if (na(p.created_at)) geef(uid, "coach", "coach_intake", `coachintake:${uid}`, { meta: { plan: p.id } });
  for (const p of plannen) if (p.afgerond_at && na(p.afgerond_at)) geef(p.member_id, "coach", "coach_plan", `coachplan:${p.id}`, { meta: { plan: p.id } });
  for (const c of checkins) {
    const uid = c.week?.plan?.member_id;
    if (uid && na(c.created_at)) geef(uid, "coach", "coach_checkin", `coachcheckin:${uid}:${isoWeek(c.created_at)}`);
  }
  for (const c of csessies) {
    const uid = c.week?.plan?.member_id;
    if (uid && na(c.gedaan_at)) geef(uid, "coach", "coach_afvink", `coachafvink:${c.id}`);
  }
  for (const m of mijlpalen) if (na(m.created_at)) geef(m.member_id, "coach", "coach_mijlpaal", `mijlpaal:${m.id}`);

  // ---------- 4f. events ----------
  const ev = new Map(events.map((e) => [e.id, e]));
  for (const su of signups) {
    const e = ev.get(su.event_id);
    if (e && na(e.starts_at) && verleden(e.ends_at || e.starts_at)) geef(su.user_id, "event", "event", `event:${e.id}:${su.user_id}`);
  }

  // ---------- 5. badges ----------
  const badgeHeb = new Map();
  for (const b of badgesAl) { if (!badgeHeb.has(b.user_id)) badgeHeb.set(b.user_id, new Set()); badgeHeb.get(b.user_id).add(b.badge); }
  const nieuweBadgeRijen = [];
  const badgeMeldingen = new Map();
  const checksVan = groepeer(checks, "user_id");
  const logsVan = groepeer(logs, "user_id");
  for (const uid of lid.keys()) {
    const alle = sessiesVan.get(uid) || [];
    const gehaald = gehaaldVan.get(uid) || new Set();
    let reeksMax = 0;
    for (const w of gehaald) reeksMax = Math.max(reeksMax, reeks(gehaald, w).lengte);
    const gasten = new Set([
      ...deelnemers.filter((p) => p.confirmed_at && bk.get(p.booking_id)?.user_id === uid).map((p) => p.user_id),
      ...invites.filter((i) => i.confirmed_at && i.inviter_id === uid).map((i) => String(i.email).toLowerCase()),
    ]);
    const mijnChecks = checksVan.get(uid) || [];
    const statsNu = {
      ...sessieStats(alle), reeksMax, zaalchecks: mijnChecks.length,
      nuttigeFotos: mijnChecks.filter((c) => c.photo_path && c.owner_verdict === "terecht").length,
      gasten: gasten.size, omgezet: omgezet.get(uid) || 0, logs: (logsVan.get(uid) || []).length,
      plansAf: plannen.filter((p) => p.member_id === uid && p.afgerond_at).length,
    };
    const al = badgeHeb.get(uid) || new Set();
    const nieuw = nieuweBadges(statsNu, al);
    if (!nieuw.length) continue;
    // Wat vóór de lancering al gehaald was, krijgt de badge — maar geen punten.
    const statsVoor = {
      ...sessieStats(alle.filter((b) => !na(b.starts_at))),
      logs: (logsVan.get(uid) || []).filter((l) => !na(l.created_at)).length,
      zaalchecks: 0, nuttigeFotos: 0, gasten: 0, omgezet: 0, reeksMax: 0, plansAf: plannen.filter((p) => p.member_id === uid && p.afgerond_at && !na(p.afgerond_at)).length,
    };
    const alVoor = new Set(nieuweBadges(statsVoor));
    for (const id of nieuw) {
      nieuweBadgeRijen.push({ gym_id: gym, user_id: uid, badge: id });
      const b = BADGE[id];
      if (!alVoor.has(id)) {
        geef(uid, "badge", null, `badge:${uid}:${id}`, { vast: b.punten, meta: { badge: id } });
        if (!badgeMeldingen.has(uid)) badgeMeldingen.set(uid, []);
        badgeMeldingen.get(uid).push(b);
      }
    }
  }

  // ---------- 6. maandelijks ----------
  const vorigeMaandStart = new Date(beginMaand(nu, 1)).getTime();
  const tweeMaandenTerug = new Date(beginMaand(nu, 2)).getTime();
  const mk = maandSleutel(iso(vorigeMaandStart));
  if (maandStart > start) {
    // Scorebord van vorige maand. Punten van die maand, uit het boek (scorebord/handmatig/uitgaven tellen niet).
    const perLidM = new Map();
    const alleRijen = [...ledger, ...rijen.map((r) => ({ ...r, created_at: iso(t) }))];
    for (const uid of lid.keys()) {
      const p = lid.get(uid);
      if (p.is_test) continue;
      const rr = alleRijen.filter((r) => r.user_id === uid);
      const deze = tellers(rr.filter((r) => new Date(r.created_at).getTime() < maandStart), { sinds: iso(vorigeMaandStart) }).klassement;
      const vorige = tellers(rr.filter((r) => new Date(r.created_at).getTime() < vorigeMaandStart), { sinds: iso(tweeMaandenTerug) }).klassement;
      const sessies = (sessiesVan.get(uid) || []).filter((b) => { const x = new Date(b.starts_at).getTime(); return x >= vorigeMaandStart && x < maandStart; }).length;
      const aangebracht = alleRijen.filter((r) => r.user_id === uid && r.kind === "vriend_eerste" && new Date(r.created_at).getTime() >= vorigeMaandStart && new Date(r.created_at).getTime() < maandStart).length;
      perLidM.set(uid, { naam: p.full_name || "", deze, vorige, sessies, aangebracht });
    }
    const k = klassement(perLidM);
    const plaatsen = ["scorebord_1", "scorebord_2", "scorebord_3"];
    k.top.slice(0, 3).forEach((x, i) => geef(x.id, "scorebord", plaatsen[i], `scorebord:${mk}:${i + 1}`, { meta: { maand: mk, plaats: i + 1 } }));
    if (k.verbeterd) geef(k.verbeterd.id, "scorebord", "verbeterd", `verbeterd:${mk}`, { meta: { maand: mk } });
    if (k.aanbrenger) geef(k.aanbrenger.id, "scorebord", "aanbrenger", `aanbrenger:${mk}`, { meta: { maand: mk, vrienden: k.aanbrenger.aangebracht } });

    // Gymdoel van vorige maand: gehaald → iedereen met ≥ 2 sessies die maand.
    const tel = (van, tot) => voltooid.filter((b) => { const x = new Date(b.starts_at).getTime(); return x >= van && x < tot; }).length;
    const doel = gymdoel(tel(tweeMaandenTerug, vorigeMaandStart));
    const gedaan = tel(vorigeMaandStart, maandStart);
    if (gedaan >= doel && vorigeMaandStart >= start - 31 * DAG) {
      for (const [uid, l] of sessiesVan) {
        const n = l.filter((b) => { const x = new Date(b.starts_at).getTime(); return x >= vorigeMaandStart && x < maandStart; }).length;
        if (n >= 2) geef(uid, "gymdoel", "gymdoel", `gymdoel:${mk}:${uid}`, { meta: { maand: mk, doel, gedaan } });
      }
    }
  }

  // ---------- 7. verval ----------
  for (const uid of lid.keys()) {
    const l = sessiesVan.get(uid) || [];
    const laatste = l.length ? new Date(l[l.length - 1].ends_at).getTime() : new Date(lid.get(uid).created_at).getTime();
    if (t - laatste < s.verval_maanden * 30 * DAG) continue;
    const { saldo } = tellers([...(perLid.get(uid) || []), ...rijen.filter((r) => r.user_id === uid)]);
    if (saldo <= 0) continue;
    const key = `verval:${uid}:${dagBxl(iso(laatste))}`;
    if (bestaat.has(key)) continue;
    rijen.push({ gym_id: gym, user_id: uid, kind: "verval", points: -saldo, source_key: key, meta: { laatste_sessie: iso(laatste) } });
    bestaat.add(key);
  }

  // ---------- schrijven ----------
  const voorPerLid = new Map([...lid.keys()].map((uid) => [uid, tellers(perLid.get(uid) || [])]));
  const nieuw = await schrijfPunten(admin, rijen);
  if (nieuweBadgeRijen.length) {
    const { error } = await admin.from("member_badges").upsert(nieuweBadgeRijen, { onConflict: "user_id,badge", ignoreDuplicates: true });
    if (error) console.error("badges:", error.message);
  }

  // Ambassadeur ★★★ en 👑: een gratis sessie uit het aanbrengbudget. Staat het budget op, dan volgende maand.
  const ambRijen = [...ledger, ...nieuw].filter((r) => r.kind === "badge" && BADGE_MET_SESSIE.has(r.meta?.badge));
  const alGekregen = new Set(credAmb.map((c) => c.ref_id));
  let ambDezeMaand = credAmb.filter((c) => new Date(c.created_at).getTime() >= maandStart).length;
  for (const r of ambRijen) {
    if (alGekregen.has(r.id) || ambDezeMaand >= s.max_aanbreng_maand) continue;
    const { error } = await admin.from("credits_ledger").insert({ gym_id: gym, user_id: r.user_id, delta: 1, reason: "ambassadeur", ref_id: r.id, expires_at: iso(t + 92 * DAG) });
    if (!error) { ambDezeMaand++; alGekregen.add(r.id); }
  }

  // Meldingen voor wie er iets bij kreeg.
  const geraakt = new Set(nieuw.map((r) => r.user_id));
  for (const uid of geraakt) {
    const voor = voorPerLid.get(uid) || { lifetime: 0, saldo: 0 };
    const naT = tellers([...(perLid.get(uid) || []), ...nieuw.filter((r) => r.user_id === uid)]);
    await meldVooruitgang({ gymId: gym, userId: uid, voor, na: naT, prijs: s.prijs_sessie, badges: badgeMeldingen.get(uid) || [] });
  }

  // ---------- 7b. reeks in gevaar (donderdagavond) ----------
  // Wie een reeks van 2+ weken heeft en deze week zijn weekdoel nog niet haalt (ook niet met wat al geboekt staat),
  // krijgt één belletje met een link naar de rustige uren. Eén keer per week: de sleutel staat in de melding.
  const bxl = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(nu);
  const dagNu = bxl.find((x) => x.type === "weekday")?.value, uurNu = Number(bxl.find((x) => x.type === "hour")?.value);
  if (dagNu === "Thu" && uurNu >= 17) {
    const { data: al } = await admin.from("notifications").select("user_id").eq("gym_id", gym).eq("link", `/boeken?rustig=1&reeks=${dezeWeek}`);
    const gemeld = new Set((al || []).map((n) => n.user_id));
    for (const [uid, gehaald] of gehaaldVan) {
      if (gemeld.has(uid)) continue;
      const r = reeks(gehaald, isoWeek(iso(t - 7 * DAG))).lengte;
      if (r < 2) continue;
      const doel = Math.min(4, Math.max(1, lid.get(uid).streak_target || 1));
      const dezeWeekTel = boekingen.filter((b) => b.user_id === uid && b.status === "bevestigd" && isoWeek(b.starts_at) === dezeWeek).length;
      if (dezeWeekTel >= doel) continue;
      await notify({ gymId: gym, userId: uid, type: "system", title: `🔥 Je reeks van ${r} weken loopt gevaar`, body: `Nog ${doel - dezeWeekTel} sessie${doel - dezeWeekTel === 1 ? "" : "s"} deze week om ze te houden — rustige uren geven dubbele punten.`, link: `/boeken?rustig=1&reeks=${dezeWeek}` });
    }
  }

  // ---------- 8. de feed ----------
  const posts = await feedPosts(admin, gym, voltooid, t, start);

  // ---------- 9. rustige uren (één keer per nacht) ----------
  const rustig = await herberekenRustigeUren(admin, s, boekingen, nu);

  return { nieuw: nieuw.length, badges: nieuweBadgeRijen.length, posts, rustig };
}

function groepeer(rijen, veld) {
  const m = new Map();
  for (const r of rijen) { const k = r[veld]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
}

// Posts na afloop, niet meer bij het boeken (0165). Enkel voor sessies van de laatste 3 dagen: oudere zijn geen
// nieuws meer, en de bestaande posts van vóór de lancering blijven gewoon staan.
async function feedPosts(admin, gym, voltooid, t, start) {
  const venster = Math.max(start, t - 3 * DAG);
  const recent = voltooid.filter((b) => new Date(b.ends_at).getTime() >= venster);
  if (!recent.length) return 0;
  const { data: al } = await admin.from("posts").select("booking_id").eq("gym_id", gym).eq("kind", "activity").in("booking_id", recent.map((b) => b.id));
  const heeft = new Set((al || []).map((p) => p.booking_id));
  const telPer = new Map();
  for (const b of voltooid) telPer.set(b.user_id, (telPer.get(b.user_id) || 0) + 1);
  const nieuw = [];
  for (const b of recent) {
    if (heeft.has(b.id)) continue;
    const uren = Math.max(1, Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / 3600000));
    nieuw.push({ gym_id: gym, author_id: b.user_id, kind: "activity", body: `trainde ${uren} uur`, booking_id: b.id, meta: { hours: uren, starts_at: b.starts_at }, audience: "gym" });
    // De mijlpaal hoort bij de sessie die hem haalt: de n-de voltooide sessie van dit lid.
    const n = voltooid.filter((x) => x.user_id === b.user_id && new Date(x.starts_at) <= new Date(b.starts_at)).length;
    if (MIJLPALEN.has(n)) {
      nieuw.push({ gym_id: gym, author_id: b.user_id, kind: "achievement", body: n === 1 ? "trainde voor het eerst bij Fittin' 🎉" : `behaalde ${n} sessies 🏅`, meta: { milestone: n, booking: b.id }, audience: "gym" });
    }
  }
  if (!nieuw.length) return 0;
  const { error } = await admin.from("posts").insert(nieuw);
  if (error) { console.error("feed:", error.message); return 0; }
  return nieuw.length;
}

/**
 * Per uur-van-de-week: in hoeveel van de laatste 8 volle weken was het (deels) geboekt? Eén keer per nacht.
 * Een pin van de uitbater blijft staan: de upsert schrijft enkel weeks_booked, klasse en computed_at.
 */
export async function herberekenRustigeUren(admin, s, boekingen, nu = new Date(), { forceer = false } = {}) {
  const gym = s.gym_id;
  const { data: laatst } = await admin.from("slot_demand").select("computed_at").eq("gym_id", gym).order("computed_at", { ascending: false }).limit(1).maybeSingle();
  if (!forceer && laatst && nu.getTime() - new Date(laatst.computed_at).getTime() < 20 * 3600000) return 0;
  const { data: g } = await admin.from("gyms").select("open_hour, close_hour").eq("id", gym).single();
  const open = g?.open_hour ?? 6, dicht = g?.close_hour ?? 23;
  const van = nu.getTime() - 56 * DAG;
  const weken = new Map(); // "dow:hour" → Set(week)
  for (const b of boekingen) {
    if (b.status !== "bevestigd") continue;
    const s0 = new Date(b.starts_at).getTime(), e0 = new Date(b.ends_at).getTime();
    if (s0 < van || s0 >= nu.getTime()) continue;
    for (let x = s0; x < e0; x += 1800000) {
      const { dow, hour } = dowUur(new Date(x).toISOString());
      const k = `${dow}:${hour}`;
      if (!weken.has(k)) weken.set(k, new Set());
      weken.get(k).add(isoWeek(new Date(x).toISOString()));
    }
  }
  const rijen = [];
  for (let dow = 1; dow <= 7; dow++) {
    for (let hour = open; hour < dicht; hour++) {
      const n = weken.get(`${dow}:${hour}`)?.size || 0;
      rijen.push({ gym_id: gym, dow, hour, weeks_booked: n, klasse: klasseVan(n, { rustigMax: s.rustig_max_weken, drukMin: s.druk_min_weken }), computed_at: nu.toISOString() });
    }
  }
  const { error } = await admin.from("slot_demand").upsert(rijen, { onConflict: "gym_id,dow,hour" });
  if (error) throw new Error(`rustige uren: ${error.message}`);
  return rijen.length;
}

