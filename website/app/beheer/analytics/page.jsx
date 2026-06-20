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

  const [{ data: payments }, { data: bookings }, { data: members }, { count: activeMemberships }, { count: subCount }] = await Promise.all([
    supabase.from("payments").select("amount_cents, kind, created_at").eq("gym_id", gym.id).gte("created_at", yearAgo.toISOString()),
    supabase.from("bookings").select("starts_at, status, user_id, coach_id, created_at").eq("gym_id", gym.id).gte("starts_at", yearAgo.toISOString()),
    supabase.from("profiles").select("id, full_name, role, created_at").eq("gym_id", gym.id),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "actief"),
    supabase.from("subscribers").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "active"),
  ]);

  const pays = payments || [];
  const confirmed = (bookings || []).filter((b) => b.status === "bevestigd");
  const lids = (members || []).filter((m) => m.role === "lid");
  const nameById = new Map((members || []).map((m) => [m.id, m.full_name || "Lid"]));
  const totalMembers = lids.length;

  // --- Revenue ---
  const revInMonth = (back) => pays.filter((p) => ym(new Date(p.created_at)) === thisYM - back).reduce((a, p) => a + (p.amount_cents || 0), 0);
  const revThis = revInMonth(0), revLast = revInMonth(1);
  const revDelta = revLast ? Math.round(((revThis - revLast) / revLast) * 100) : null;
  const mrr = pays.filter((p) => p.kind === "abonnement" && new Date(p.created_at) >= d30).reduce((a, p) => a + (p.amount_cents || 0), 0);
  const arpu = totalMembers ? Math.round(revThis / totalMembers) : 0;

  const revTrend = [];
  for (let i = 7; i >= 0; i--) revTrend.push({ label: MON[(now.getMonth() - i + 12) % 12], value: revInMonth(i) });

  // --- Members & growth ---
  const newInMonth = (back) => lids.filter((m) => ym(new Date(m.created_at)) === thisYM - back).length;
  const newThis = newInMonth(0), newLast = newInMonth(1);
  const growth = [];
  for (let i = 7; i >= 0; i--) growth.push({ label: MON[(now.getMonth() - i + 12) % 12], value: newInMonth(i) });

  // --- Engagement (from confirmed bookings) ---
  const lastVisit = new Map(), visitCount = new Map(), visitThisMonth = new Map();
  for (const b of confirmed) {
    if (new Date(b.starts_at) > now) continue;
    const prev = lastVisit.get(b.user_id);
    if (!prev || new Date(b.starts_at) > new Date(prev)) lastVisit.set(b.user_id, b.starts_at);
    visitCount.set(b.user_id, (visitCount.get(b.user_id) || 0) + 1);
    if (ym(new Date(b.starts_at)) === thisYM) visitThisMonth.set(b.user_id, (visitThisMonth.get(b.user_id) || 0) + 1);
  }
  const visitedLast30 = lids.filter((m) => { const lv = lastVisit.get(m.id); return lv && new Date(lv) >= d30; }).length;
  const activeRate = totalMembers ? Math.round((visitedLast30 / totalMembers) * 100) : 0;
  const visitsThisMonthTotal = [...visitThisMonth.values()].reduce((a, v) => a + v, 0);
  const avgVisits = visitedLast30 ? (visitsThisMonthTotal / visitedLast30).toFixed(1) : "0";
  const atRisk = lids.filter((m) => { const lv = lastVisit.get(m.id); return !lv || new Date(lv) < d30; }).length;

  // --- No-show ---
  const recent = (bookings || []).filter((b) => new Date(b.starts_at) >= d60 && new Date(b.starts_at) <= now);
  const noShows = recent.filter((b) => b.status === "no_show").length;
  const noShowRate = recent.length ? Math.round((noShows / recent.length) * 100) : 0;

  // --- Funnel ---
  const bookedOnce = new Set([...visitCount.keys()].filter((id) => nameById.has(id)));
  const bookedRepeat = [...visitCount.entries()].filter(([id, n]) => n >= 2 && nameById.has(id)).length;
  const funnel = [
    { label: "Accounts", value: totalMembers },
    { label: "Eerste boeking", value: [...bookedOnce].filter((id) => lids.find((l) => l.id === id)).length },
    { label: "Terugkerend (2+)", value: bookedRepeat },
    { label: "Abonnee", value: activeMemberships || 0 },
  ];

  // --- Tops ---
  const topMembers = [...visitCount.entries()].filter(([id]) => lids.find((l) => l.id === id)).sort((a, b) => b[1] - a[1]).slice(0, 5);
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
    <div className="px-8 py-8">
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
        <Kpi label="Actieve leden" value={totalMembers} sub={`+${newThis} deze maand`} good={newThis >= newLast} />
        <Kpi label="Actief (30d)" value={activeRate + "%"} sub={`${visitedLast30}/${totalMembers} kwamen`} />
        <Kpi label="ARPU" value={euro(arpu)} sub="omzet per lid / maand" />
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
            <Link href="/beheer/activatie" className="rounded-xl bg-accent/10 p-4 transition hover:bg-accent/20">
              <p className="text-2xl font-black text-accentdark">{atRisk}</p>
              <p className="text-xs font-bold text-brand/60">leden at-risk (30d stil) →</p>
            </Link>
          </div>
        </Card>
        <Card title="Conversie-funnel" subtitle="van account tot abonnee">
          <Funnel steps={funnel} />
        </Card>
      </div>

      {/* Tops */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Meest actieve leden">
          <TopList rows={topMembers.map(([id, n]) => ({ name: nameById.get(id), value: n + " sessies" }))} empty="Nog geen sessies." />
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
          <table className="text-xs">
            <thead><tr className="text-brand/40"><th className="px-2 py-1"></th>{WD.map((d) => <th key={d} className="px-2 py-1 font-bold uppercase">{d}</th>)}</tr></thead>
            <tbody>
              {showHours.map((h) => (
                <tr key={h}>
                  <td className="px-2 py-0.5 text-right text-[10px] font-bold text-brand/40">{h}:00</td>
                  {WD.map((d) => {
                    const c = grid[`${d}-${h}`] || 0; const intensity = gmax ? c / gmax : 0;
                    return (
                      <td key={d} className="px-1 py-0.5">
                        <div className="flex h-5 w-10 items-center justify-center rounded text-[10px] font-bold"
                          style={{ backgroundColor: c ? `rgba(95,218,107,${0.15 + intensity * 0.85})` : "#f5f6fa", color: intensity > 0.5 ? "#22194f" : "#9b97ab" }}>
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
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
          <span className="flex items-center gap-2 font-semibold text-brand"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-black text-white">{i + 1}</span>{r.name}</span>
          <span className="text-xs font-bold text-brand/50">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
