import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { BarChart, Donut, Funnel } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const euroK = (c) => { const v = (c || 0) / 100; return v >= 1000 ? "€" + (v / 1000).toFixed(1) + "k" : "€" + Math.round(v); };
const WD = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function brussels(iso) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const wd = parts.find((p) => p.type === "weekday")?.value.toLowerCase().slice(0, 2);
  const map = { mo: "ma", tu: "di", we: "wo", th: "do", fr: "vr", sa: "za", su: "zo" };
  return { wd: map[wd] || wd, hour: parseInt(parts.find((p) => p.type === "hour")?.value, 10) };
}
const ym = (d) => d.getFullYear() * 12 + d.getMonth();

export default async function Analytics() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const now = new Date();
  const thisYM = ym(now);
  const yearAgo = new Date(now.getTime() - 365 * 86400000);
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);

  const [{ data: payments }, { data: bookings }, { data: members }, { data: memRows }, { count: subCount }] = await Promise.all([
    supabase.from("payments").select("user_id, amount_cents, kind, created_at").eq("gym_id", gym.id).gte("created_at", yearAgo.toISOString()),
    supabase.from("bookings").select("starts_at, status, user_id, coach_id, created_at").eq("gym_id", gym.id).gte("starts_at", yearAgo.toISOString()),
    supabase.from("profiles").select("id, full_name, role, welcome_code_used, created_at").eq("gym_id", gym.id),
    supabase.from("memberships").select("user_id, status").eq("gym_id", gym.id),
    supabase.from("subscribers").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "active"),
  ]);
  const subStatus = new Map((memRows || []).map((m) => [m.user_id, m.status]));

  const pays = payments || [];
  const confirmed = (bookings || []).filter((b) => b.status === "bevestigd");
  const lids = (members || []).filter((m) => m.role === "lid");
  const lidIds = new Set(lids.map((m) => m.id));
  const nameById = new Map((members || []).map((m) => [m.id, m.full_name || "Lid"]));
  const totalMembers = lids.length;
  // Abonnementen tellen alleen mee voor wie ook in stap 1 van de trechter zit. Zonder deze filter
  // konden coach- en beheeraccounts de laatste stap breder maken dan de eerste — een trechter die
  // naar onderen toe uitzet leest als groei terwijl het een telfout is.
  const activeMemberships = (memRows || []).filter((m) => m.status === "actief" && lidIds.has(m.user_id)).length;

  // --- Revenue ---
  const revInMonth = (back) => pays.filter((p) => ym(new Date(p.created_at)) === thisYM - back).reduce((a, p) => a + (p.amount_cents || 0), 0);
  const revThis = revInMonth(0), revLast = revInMonth(1);
  const revDelta = revLast ? Math.round(((revThis - revLast) / revLast) * 100) : null;
  const mrr = pays.filter((p) => p.kind === "abonnement" && new Date(p.created_at) >= d30).reduce((a, p) => a + (p.amount_cents || 0), 0);
  // ARPU per BETALEND lid, niet per account. Delen door alle accounts (waarvan de meeste in een
  // gegeven maand niets kopen) geeft een cijfer dat vanzelf daalt naarmate je meer aanmeldingen
  // hebt — precies het omgekeerde signaal van wat er gebeurt.
  const betalersThis = new Set(pays.filter((p) => ym(new Date(p.created_at)) === thisYM && p.user_id).map((p) => p.user_id));
  const arpu = betalersThis.size ? Math.round(revThis / betalersThis.size) : 0;

  const revTrend = [];
  for (let i = 7; i >= 0; i--) revTrend.push({ label: MON[(now.getMonth() - i + 12) % 12], value: revInMonth(i) });

  // --- Members & growth ---
  const newInMonth = (back) => lids.filter((m) => ym(new Date(m.created_at)) === thisYM - back).length;
  const newThis = newInMonth(0), newLast = newInMonth(1);
  const growth = [];
  for (let i = 7; i >= 0; i--) growth.push({ label: MON[(now.getMonth() - i + 12) % 12], value: newInMonth(i) });

  // --- Engagement (from confirmed bookings) ---
  const lastVisit = new Map(), visitCount = new Map(), visitThisMonth = new Map(), komtNog = new Set();
  for (const b of confirmed) {
    if (new Date(b.starts_at) > now) { komtNog.add(b.user_id); continue; }
    const prev = lastVisit.get(b.user_id);
    if (!prev || new Date(b.starts_at) > new Date(prev)) lastVisit.set(b.user_id, b.starts_at);
    visitCount.set(b.user_id, (visitCount.get(b.user_id) || 0) + 1);
    if (ym(new Date(b.starts_at)) === thisYM) visitThisMonth.set(b.user_id, (visitThisMonth.get(b.user_id) || 0) + 1);
  }
  const visitedLast30 = lids.filter((m) => { const lv = lastVisit.get(m.id); return lv && new Date(lv) >= d30; }).length;
  const activeRate = totalMembers ? Math.round((visitedLast30 / totalMembers) * 100) : 0;
  const visitsThisMonthTotal = [...visitThisMonth.values()].reduce((a, v) => a + v, 0);
  const avgVisits = visitedLast30 ? (visitsThisMonthTotal / visitedLast30).toFixed(1) : "0";
  // Zelfde definitie als /beheer/leden?filter=atrisk (waar dit cijfer naartoe linkt): al getraind,
  // >30 dagen stil, en niets meer in de agenda. Wie nooit boekte hoort in de onboarding, niet hier.
  const atRisk = lids.filter((m) => { const lv = lastVisit.get(m.id); return lv && !komtNog.has(m.id) && new Date(lv) < d30; }).length;

  // --- No-show ---
  const recent = (bookings || []).filter((b) => new Date(b.starts_at) >= d60 && new Date(b.starts_at) <= now);
  const noShows = recent.filter((b) => b.status === "no_show").length;
  const noShowRate = recent.length ? Math.round((noShows / recent.length) * 100) : 0;

  // --- Funnel --- alle stappen op dezelfde basis: leden (rol 'lid'). Coaches en beheerders horen
  // niet in een klanttrechter.
  const bookedOnce = new Set([...visitCount.keys()].filter((id) => lidIds.has(id)));
  const bookedRepeat = [...visitCount.entries()].filter(([id, k]) => k >= 2 && lidIds.has(id)).length;
  const funnel = [
    { label: "Accounts", value: totalMembers },
    { label: "Eerste boeking", value: bookedOnce.size },
    { label: "Terugkerend (2+)", value: bookedRepeat },
    { label: "Abonnee", value: activeMemberships || 0 },
  ];

  // --- Het gratis eerste uur --- de belangrijkste belofte van de site had tot nu geen enkel
  // geaggregeerd cijfer: je zag wel dat leden binnenkwamen, niet of het weggeven ooit een betalende
  // klant opleverde. Geen nieuwe tracking nodig: welcome_code_used staat op het profiel en het
  // aantal bevestigde sessies staat al in visitCount.
  const gratisGebruikt = lids.filter((m) => m.welcome_code_used);
  const gratisDaarnaBetaald = gratisGebruikt.filter((m) => (visitCount.get(m.id) || 0) >= 2).length;
  const gratisFunnel = [
    { label: "Gratis sessie gebruikt", value: gratisGebruikt.length },
    { label: "Tweede sessie betaald", value: gratisDaarnaBetaald },
  ];

  // --- Tops ---
  const topMembers = [...visitCount.entries()].filter(([id]) => lidIds.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const coachCount = new Map();
  for (const b of confirmed) if (b.coach_id) coachCount.set(b.coach_id, (coachCount.get(b.coach_id) || 0) + 1);
  const topCoaches = [...coachCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // --- Heatmap ---
  const hours = []; for (let h = gym.open_hour; h < gym.close_hour; h++) hours.push(h);
  const grid = {}; let gmax = 0; const wdTotals = {}; const hourTotals = {};
  for (const b of confirmed) {
    if (new Date(b.starts_at) < d60) continue;
    const { wd, hour } = brussels(b.starts_at);
    const k = `${wd}-${hour}`; grid[k] = (grid[k] || 0) + 1; if (grid[k] > gmax) gmax = grid[k];
    wdTotals[wd] = (wdTotals[wd] || 0) + 1; hourTotals[hour] = (hourTotals[hour] || 0) + 1;
  }
  const peakDay = Object.entries(wdTotals).sort((a, b) => b[1] - a[1])[0];
  const peakHour = Object.entries(hourTotals).sort((a, b) => b[1] - a[1])[0];
  // Only show hours with activity (24/7 gym → 24 rows is far too tall). Fallback to a sane range.
  const activeHours = hours.filter((h) => (hourTotals[h] || 0) > 0);
  const showHours = activeHours.length ? activeHours : hours.filter((h) => h >= 7 && h <= 22);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-3xl font-black text-brand">Analytics</h1>
      <p className="mt-1 text-sm text-brand/50">De gezondheid van je business in één oogopslag — omzet, groei, retentie en bezetting.</p>

      {/* In-app first-party traffic analytics (own DB, privacy-friendly) */}
      <Link
        href="/beheer/verkeer"
        className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc bg-white p-5 transition hover:border-accent"
      >
        <div>
          <p className="font-black text-brand">🌐 Websiteverkeer</p>
          <p className="mt-0.5 text-sm text-brand/55">Bezoekers, paginaweergaves, populairste pagina's en herkomst — live in je eigen dashboard, zonder cookies of externe tracker.</p>
        </div>
        <span className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">Bekijk verkeer →</span>
      </Link>

      {/* KPI row */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Omzet deze maand" value={euro(revThis)} delta={revDelta} />
        <Kpi label="MRR (abonnementen)" value={euro(mrr)} sub="laatste 30 dagen" />
        {/* 'Accounts', niet 'Actieve leden': dit telt iedereen met een profiel, ook wie nooit boekte.
            Hoeveel daarvan écht actief zijn staat in de KPI hiernaast. */}
        <Kpi label="Accounts" value={totalMembers} sub={`+${newThis} deze maand`} good={newThis >= newLast} />
        <Kpi label="Actief (30d)" value={activeRate + "%"} sub={`${visitedLast30}/${totalMembers} kwamen`} />
        <Kpi label="ARPU" value={euro(arpu)} sub={`per betalend lid · ${betalersThis.size} betaalden`} />
      </div>

      {/* Trends */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Omzet" subtitle="laatste 8 maanden">
          <BarChart data={revTrend} format={euroK} />
        </Card>
        <Card title="Nieuwe leden" subtitle="laatste 8 maanden">
          <BarChart data={growth} />
        </Card>
      </div>

      {/* Engagement + funnel */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Retentie & betrokkenheid">
          <Donut value={activeRate} label="van de leden kwam de laatste 30 dagen" sub={`gem. ${avgVisits} sessies/maand per actief lid`} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Mini label="No-show ratio" value={noShowRate + "%"} sub="laatste 60 dagen" warn={noShowRate > 10} />
            {/* Wijst naar de at-risk-lijst: dáár staan de comeback-mail per lid en de knop
                "start comeback-reeks voor iedereen" — het cijfer is meteen de handeling. */}
            <Link href="/beheer/leden?filter=atrisk" className="rounded-xl bg-accent/10 p-4 transition hover:bg-accent/20">
              <p className="text-2xl font-black text-accentdark">{atRisk}</p>
              <p className="text-xs font-bold text-brand/60">leden at-risk — mail ze terug →</p>
            </Link>
          </div>
        </Card>
        <Card title="Conversie-funnel" subtitle="van account tot abonnee">
          <Funnel steps={funnel} />
          {gratisGebruikt.length > 0 && (
            <div className="mt-5 border-t border-borderc pt-4">
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-lav">Het gratis eerste uur</p>
              <Funnel steps={gratisFunnel} />
            </div>
          )}
        </Card>
      </div>

      {/* Tops — the abo tag turns this from trivia into a conversion list: frequent members
          WITHOUT an abo are exactly who to pitch (the app already nudges them on /account). */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Meest actieve leden" subtitle="wie vaak komt zonder abo = je beste abo-kandidaat">
          <TopList
            rows={topMembers.map(([id, n]) => {
              const st = subStatus.get(id);
              return {
                name: nameById.get(id),
                value: n + " sessies",
                tag: st === "actief" ? "★ Abo" : st === "past_due" ? "⚠ abo" : "geen abo",
                tagTone: st === "actief" ? "ok" : st === "past_due" ? "warn" : "amber",
              };
            })}
            empty="Nog geen sessies."
          />
        </Card>
        <Card title="Drukste coaches">
          <TopList rows={topCoaches.map(([id, n]) => ({ name: nameById.get(id), value: n + " sessies" }))} empty="Nog geen coach-sessies." />
        </Card>
      </div>

      {/* Heatmap */}
      <Card className="mt-6" title="Bezettings-heatmap" subtitle="boekingen per uur en weekdag (laatste 60 dagen)">
        {peakDay && (
          <p className="mb-3 text-sm text-brand/60">Piek: <span className="font-bold text-brand">{({ ma: "maandag", di: "dinsdag", wo: "woensdag", do: "donderdag", vr: "vrijdag", za: "zaterdag", zo: "zondag" })[peakDay[0]]}</span> en rond <span className="font-bold text-brand">{peakHour?.[0]}:00</span>.</p>
        )}
        <div className="overflow-x-auto">
          {/* Full-width grid — fixed 40px-wide cells left ~70% of the card empty. */}
          <table className="w-full table-fixed text-xs">
            <thead><tr className="text-brand/40"><th className="w-12 px-2 py-1"></th>{WD.map((d) => <th key={d} className="px-2 py-1 font-bold uppercase">{d}</th>)}</tr></thead>
            <tbody>
              {showHours.map((h) => (
                <tr key={h}>
                  <td className="w-12 px-2 py-0.5 text-right text-[10px] font-bold text-brand/40">{h}:00</td>
                  {WD.map((d) => {
                    const c = grid[`${d}-${h}`] || 0; const intensity = gmax ? c / gmax : 0;
                    return (
                      <td key={d} className="px-0.5 py-0.5">
                        <div className="flex h-6 w-full items-center justify-center rounded-md text-[10px] font-bold"
                          style={{ backgroundColor: c ? `rgba(95,218,107,${0.15 + intensity * 0.85})` : "#f5f6fa", color: intensity > 0.5 ? "#22194f" : "#9b97ab" }}
                          title={c ? `${c} boekingen` : ""}>
                          {c || ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, delta, sub, good }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className="mt-2 text-2xl font-black text-brand">{value}</p>
      {delta != null && <p className={"text-xs font-bold " + (delta >= 0 ? "text-accentdark" : "text-red-500")}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs vorige maand</p>}
      {sub && delta == null && <p className={"text-xs font-semibold " + (good === false ? "text-red-500" : "text-brand/40")}>{sub}</p>}
    </div>
  );
}
function Card({ title, subtitle, children, className = "" }) {
  return (
    <section className={"rounded-2xl border border-borderc bg-white p-6 " + className}>
      <h2 className="font-black text-brand">{title}</h2>
      {subtitle && <p className="text-xs text-brand/50">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
function Mini({ label, value, sub, warn }) {
  return (
    <div className="rounded-xl bg-paper p-4">
      <p className={"text-2xl font-black " + (warn ? "text-red-500" : "text-brand")}>{value}</p>
      <p className="text-xs font-bold text-brand/60">{label}</p>
      {sub && <p className="text-[10px] text-brand/40">{sub}</p>}
    </div>
  );
}
function TopList({ rows, empty }) {
  if (!rows.length) return <p className="text-sm text-brand/40">{empty}</p>;
  const tone = { ok: "bg-accent/15 text-accentdark", warn: "bg-red-100 text-red-600", amber: "bg-amber-100 text-amber-600" };
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2 font-semibold text-brand">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-black text-white">{i + 1}</span>
            <span className="truncate">{r.name}</span>
            {r.tag && <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black " + (tone[r.tagTone] || tone.amber)}>{r.tag}</span>}
          </span>
          <span className="shrink-0 text-xs font-bold text-brand/50">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
