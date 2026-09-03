import { createAdminClient } from "@/lib/supabase/admin";
import { sendWeekReport } from "@/lib/email";
import { teltVoorAbo } from "@/lib/insight-mails";

// Data voor het wekelijkse rapport aan de beheerder.
//
// Leidraad (afspraak met de eigenaar): geen data om data te tonen. Elk cijfer hier moet leiden
// tot een beslissing — waar promoten, wie aanspreken, wat blokkeert er geld. Wat de app zélf al
// automatisch oplost (win-back-mails, abo-voorstellen, herinneringen) staat er als bevestiging
// dat het draait, niet als actiepunt.
//
// De week loopt maandag→zondag en is ALTIJD de week die net is afgelopen; het rapport vertrekt
// maandagochtend, dus een "lopende" week zou een half beeld geven.

const bxlDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
const WEEKDAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];

function lastWeekRange(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;           // 0 = maandag
  const thisMonday = new Date(d.getTime() - dow * 86400000);
  const start = new Date(thisMonday.getTime() - 7 * 86400000);
  return { start, end: thisMonday, prevStart: new Date(start.getTime() - 7 * 86400000) };
}

export async function buildWeekReport(gym, now = new Date()) {
  const admin = createAdminClient();
  const { start, end, prevStart } = lastWeekRange(now);
  const sIso = start.toISOString(), eIso = end.toISOString(), pIso = prevStart.toISOString();
  const d60 = new Date(start.getTime() - 60 * 86400000).toISOString();

  const [
    { data: wkBookings },
    { data: pvBookings },
    { data: wkPay },
    { data: pvPay },
    { count: newMembers },
    { count: prevNewMembers },
    { data: mems },
    { data: bk60 },
    { data: people },
    { data: coachLedger },
    { count: openReports },
    { data: mailLog },
    { data: cronRows },
    { data: openInvoices },
    { data: uninvoiced },
    { data: accessRuns },
  ] = await Promise.all([
    admin.from("bookings").select("starts_at, ends_at, status, persons, price_cents, paid, payment_source, user_id").eq("gym_id", gym.id).gte("starts_at", sIso).lt("starts_at", eIso),
    admin.from("bookings").select("status, user_id").eq("gym_id", gym.id).gte("starts_at", pIso).lt("starts_at", sIso),
    admin.from("payments").select("amount_cents, status, kind").eq("gym_id", gym.id).gte("created_at", sIso).lt("created_at", eIso),
    admin.from("payments").select("amount_cents, status").eq("gym_id", gym.id).gte("created_at", pIso).lt("created_at", sIso),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("role", "lid").gte("created_at", sIso).lt("created_at", eIso),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("role", "lid").gte("created_at", pIso).lt("created_at", sIso),
    admin.from("memberships").select("user_id, status, cancel_at_period_end, current_period_end, started_at").eq("gym_id", gym.id),
    admin.from("bookings").select("user_id, payment_source, price_cents, paid").eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", d60).lt("starts_at", eIso),
    admin.from("profiles").select("id, full_name, role").eq("gym_id", gym.id),
    admin.from("coach_ledger").select("coach_id, delta").eq("gym_id", gym.id),
    admin.from("problem_reports").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "open"),
    admin.from("email_log").select("status").gte("created_at", sIso).lt("created_at", eIso),
    admin.from("cron_runs").select("job, ok, created_at").order("created_at", { ascending: false }).limit(30),
    admin.from("payments").select("amount_cents").eq("gym_id", gym.id).eq("status", "onbetaald"),
    // Sessies van factuur-coaches die nog nooit gefactureerd zijn. Dit ontbrak: het rapport keek
    // enkel naar openstaande betaalposten, en zolang er niets gefactureerd wordt bestaat die post
    // niet — waardoor € 156 maandenlang onzichtbaar bleef oplopen.
    admin.from("bookings").select("coach_id, coach_charge_cents").eq("gym_id", gym.id)
      .eq("coach_billing", "invoice").eq("status", "bevestigd").is("coach_invoiced_at", null),
    // Deurcode-beurten van de gerapporteerde week mét detail. Een beurt waarin het Nuki-slot offline
    // leek zet ok=false terwijl de deurcodemail wél vertrok; enkel op ok kijken maakt daar "de taak
    // liep niet" van, en zo'n vals alarm leert de eigenaar het échte alarm te negeren.
    admin.from("cron_runs").select("ok, detail").eq("job", "access_codes").gte("created_at", sIso).lt("created_at", eIso),
  ]);

  // ---- Verkeer + trechter -----------------------------------------------------------------
  // Het rapport vertelde tot nu alleen wat er ná de beslissing gebeurde (sessies, omzet). Zonder
  // bezoekersaantal is een slappe week niet te duiden: kwam er minder volk, of haakte hetzelfde
  // volk af? Deze drie getallen beantwoorden dat, en de sterkste bron zegt waar promoten loont.
  // Best-effort: de meetlaag mag het rapport nooit tegenhouden (het rapport is het belangrijkste).
  let traffic = null;
  try {
    const win = { p_from: sIso, p_to: eIso };
    const [{ data: nu }, { data: vorige }, { data: events }, { data: bronnen }] = await Promise.all([
      admin.rpc("pv_summary", win),
      admin.rpc("pv_summary", { p_from: pIso, p_to: sIso }),
      admin.rpc("pv_events", win),
      admin.rpc("pv_top_referrers", { ...win, p_limit: 5 }),
    ]);
    const rij = (d) => (Array.isArray(d) ? d[0] : d) || {};
    // Op unieke BEZOEKERS, niet op hits: booking_slot_chosen vuurt bij elke tik op een uur.
    const perEvent = new Map((events || []).map((e) => [e.event, Number(e.visitors) || 0]));
    const top = (bronnen || []).filter((b) => b.referrer_host && b.referrer_host !== "(direct)")[0] || null;
    traffic = {
      visitors: Number(rij(nu).visitors) || 0,
      prevVisitors: Number(rij(vorige).visitors) || 0,
      chose: perEvent.get("booking_slot_chosen") || 0,
      completed: perEvent.get("booking_completed") || 0,
      topSource: top ? { host: top.referrer_host, views: Number(top.views) || 0 } : null,
    };
  } catch (e) {
    console.error("weekrapport verkeerscijfers overgeslagen:", e?.message);
  }

  const nameOf = new Map((people || []).map((p) => [p.id, p.full_name || "Lid"]));
  const lidIds = new Set((people || []).filter((p) => p.role === "lid").map((p) => p.id));
  const held = (wkBookings || []).filter((b) => b.status === "bevestigd");
  const cancelled = (wkBookings || []).filter((b) => b.status === "geannuleerd").length;
  const prevHeld = (pvBookings || []).filter((b) => b.status === "bevestigd");

  const paidOnly = (rows) => (rows || []).filter((p) => (p.status || "betaald") === "betaald" || p.status === "paid");
  const revenue = paidOnly(wkPay).reduce((a, p) => a + (p.amount_cents || 0), 0);
  const prevRevenue = paidOnly(pvPay).reduce((a, p) => a + (p.amount_cents || 0), 0);

  const uniqueMembers = new Set(held.map((b) => b.user_id)).size;
  const prevUnique = new Set(prevHeld.map((b) => b.user_id)).size;

  // ---- Bezetting per weekdag -------------------------------------------------------------
  // De zaal is exclusief per tijdslot, dus "hoeveel van de open halve uren waren geboekt" is
  // een eerlijk bezettingscijfer — en meteen het antwoord op "welke dag moet ik promoten".
  const slotsPerDay = Math.max(1, (gym.close_hour - gym.open_hour) * 2);
  const bookedHalfHours = {};
  const perHour = {};
  for (const b of held) {
    const day = bxlDay(new Date(b.starts_at));
    const halves = Math.max(1, Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / 1800000));
    bookedHalfHours[day] = (bookedHalfHours[day] || 0) + halves;
    const h = parseInt(new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }).format(new Date(b.starts_at)), 10);
    perHour[h] = (perHour[h] || 0) + 1;
  }
  const byDay = WEEKDAYS.map((label, i) => {
    const key = bxlDay(new Date(start.getTime() + i * 86400000));
    return { label, value: Math.round(((bookedHalfHours[key] || 0) / slotsPerDay) * 100) };
  });
  const busiestHours = Object.entries(perHour)
    .map(([h, n]) => ({ label: `${String(h).padStart(2, "0")}:00`, value: n, hour: Number(h) }))
    .sort((a, b) => b.value - a.value || a.hour - b.hour)
    .slice(0, 6)
    .sort((a, b) => a.hour - b.hour);
  const quietDays = byDay.filter((d) => d.value < 15).map((d) => d.label);

  // ---- Abonnementen ----------------------------------------------------------------------
  const all = mems || [];
  const active = all.filter((m) => m.status === "actief");
  const pastDue = all.filter((m) => m.status === "past_due");
  const ending = active.filter((m) => m.cancel_at_period_end);
  const newAbos = all.filter((m) => m.started_at && m.started_at >= sIso && m.started_at < eIso).length;

  // Abo-kandidaten: ≥3 ZELFBETAALDE sessies in 60 dagen zonder abo. De regel staat nu écht op
  // één plek (teltVoorAbo in lib/insight-mails.js). Deze nota beweerde al dat het dezelfde regel
  // was als het dashboard en de automatische mail — maar dat klopte niet: de prijscontrole
  // ontbrak hier en op het dashboard, waardoor sessies die de coach betaalde meetelden.
  const hasAbo = new Set(all.filter((m) => m.status === "actief" || m.status === "past_due").map((m) => m.user_id));
  const payCount = {};
  for (const b of bk60 || []) {
    if (!b.user_id || hasAbo.has(b.user_id) || !lidIds.has(b.user_id)) continue;
    if (teltVoorAbo(b)) payCount[b.user_id] = (payCount[b.user_id] || 0) + 1;
  }
  const candidates = Object.entries(payCount).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([uid, n]) => ({ name: nameOf.get(uid) || "Lid", sessions: n }));

  // ---- Geld dat blijft hangen ------------------------------------------------------------
  const coachBal = {};
  for (const r of coachLedger || []) coachBal[r.coach_id] = (coachBal[r.coach_id] || 0) + Number(r.delta || 0);
  const coachDebt = Object.entries(coachBal).filter(([, n]) => n < 0).sort((a, b) => a[1] - b[1])
    .map(([cid, n]) => ({ name: nameOf.get(cid) || "Coach", sessions: n, euros: Math.ceil(Math.abs(n) * 12) }));
  const openInvoiceCents = (openInvoices || []).reduce((a, p) => a + (p.amount_cents || 0), 0);
  // Nog te factureren coach-sessies, per coach. Sinds 0124 blokkeert dit bedrag hun boekingen,
  // dus het is dubbel actiepunt: geld dat binnen moet én een coach die stilligt.
  const uninvoicedByCoach = {};
  for (const b of uninvoiced || []) uninvoicedByCoach[b.coach_id] = (uninvoicedByCoach[b.coach_id] || 0) + (b.coach_charge_cents || 0);
  const toInvoice = Object.entries(uninvoicedByCoach)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cid, cents]) => ({ name: nameOf.get(cid) || "Coach", cents }));

  // ---- Draait de machine? ----------------------------------------------------------------
  // Een email_log-rij is een mail die de app zélf aanmaakte; de Resend-webhook werkt de status
  // daarna bij. 'sent' is dus enkel een tussenstand die binnen seconden 'delivered' wordt — erop
  // tellen gaf structureel nul. Een harde bounce hoort bij de mislukte kant: dát is precies het
  // geval waarin een lid zijn deurcode of bevestiging niet kreeg.
  const mailMislukt = (m) => m.status === "failed" || m.status === "bounced";
  const mailsSent = (mailLog || []).filter((m) => !mailMislukt(m)).length;
  const mailsFailed = (mailLog || []).filter(mailMislukt).length;
  const lastRun = {};
  for (const r of cronRows || []) if (!lastRun[r.job]) lastRun[r.job] = r;
  // Alleen ouderdom telt: "de taak liep niet" is iets anders dan "de taak liep met een
  // waarschuwing". Dat tweede krijgt hieronder zijn eigen, correct benoemde regel.
  const cronStale = (job, maxMin) => {
    const r = lastRun[job];
    if (!r) return true;
    return (Date.now() - new Date(r.created_at).getTime()) / 60000 > maxMin;
  };
  const lockOffline = (accessRuns || []).filter((r) =>
    r.ok === false && (r.detail?.errors || []).some((e) => String(e).includes("offline"))
  ).length;
  const health = {
    mailsSent,
    mailsFailed,
    accessCronBad: cronStale("access_codes", 20),
    activationCronBad: cronStale("activation", 60 * 30),
    lockOffline,
  };

  return {
    range: { start, end },
    sessions: { now: held.length, prev: prevHeld.length, cancelled },
    revenue: { now: revenue, prev: prevRevenue },
    members: { now: newMembers || 0, prev: prevNewMembers || 0 },
    unique: { now: uniqueMembers, prev: prevUnique },
    byDay,
    busiestHours,
    quietDays,
    abo: { active: active.length, mrr: active.length * 1200, newAbos, pastDue: pastDue.map((m) => nameOf.get(m.user_id) || "Lid"), ending: ending.map((m) => ({ name: nameOf.get(m.user_id) || "Lid", until: m.current_period_end })) },
    candidates,
    coachDebt,
    toInvoice,
    openInvoiceCents,
    openReports: openReports || 0,
    traffic,
    health,
  };
}

// Verstuurt het rapport naar elke beheerder van elke gym. Ontvangers komen uit de rollen, niet
// uit een instelling: wie beheerder wordt krijgt het rapport, wie het niet meer is niet — zo kan
// er geen adres blijven hangen dat niemand meer beheert.
//
// Dedupe op email_log per ontvanger (kind = week_rapport, deze week): draait de cron twee keer,
// of trekt Vercel de route opnieuw open, dan valt er geen tweede rapport in de bus.
export async function sendWeekReports(now = new Date()) {
  const admin = createAdminClient();
  const { end: thisMonday } = lastWeekRange(now);
  const [{ data: gyms }, { data: sentRows }] = await Promise.all([
    admin.from("gyms").select("id, name, open_hour, close_hour"),
    admin.from("email_log").select("to_email").eq("kind", "week_rapport").gte("created_at", thisMonday.toISOString()),
  ]);
  const already = new Set((sentRows || []).map((r) => String(r.to_email || "").toLowerCase()));

  let sent = 0, skipped = 0;
  for (const gym of gyms || []) {
    const { data: admins } = await admin
      .from("profiles").select("email, full_name").eq("gym_id", gym.id).eq("role", "beheerder");
    const recipients = (admins || []).filter((a) => a.email && !already.has(a.email.toLowerCase()));
    if (!recipients.length) { skipped += (admins || []).length; continue; }
    const report = await buildWeekReport(gym, now);
    for (const a of recipients) {
      const res = await sendWeekReport({ to: a.email, name: a.full_name, report, gymName: gym.name || "Fittin'" });
      if (res?.ok) sent++;
      already.add(a.email.toLowerCase());
    }
  }
  return { sent, skipped };
}
