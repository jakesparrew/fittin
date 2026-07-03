import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { BarChart, Donut } from "@/components/admin/Charts";

export const dynamic = "force-dynamic";

const fmtDay = (d) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(d);
const n = (v) => Number(v || 0);
const nl = (v) => n(v).toLocaleString("nl-BE");

export default async function Verkeer({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const sp = (await searchParams) || {};
  const days = [7, 30, 90].includes(parseInt(sp.d, 10)) ? parseInt(sp.d, 10) : 30;

  const admin = createAdminClient();
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400000);
  const prevFrom = new Date(from.getTime() - days * 86400000);
  const live = new Date(now.getTime() - 30 * 60000);

  const [sum, prev, daily, paths, refs, liveSum] = await Promise.all([
    admin.rpc("pv_summary", { p_from: from.toISOString(), p_to: now.toISOString() }),
    admin.rpc("pv_summary", { p_from: prevFrom.toISOString(), p_to: from.toISOString() }),
    admin.rpc("pv_daily", { p_from: from.toISOString(), p_to: now.toISOString() }),
    admin.rpc("pv_top_paths", { p_from: from.toISOString(), p_to: now.toISOString(), p_limit: 15 }),
    admin.rpc("pv_top_referrers", { p_from: from.toISOString(), p_to: now.toISOString(), p_limit: 12 }),
    admin.rpc("pv_summary", { p_from: live.toISOString(), p_to: now.toISOString() }),
  ]);

  const s = sum.data?.[0] || { views: 0, visitors: 0, mobile: 0, desktop: 0 };
  const p = prev.data?.[0] || { views: 0, visitors: 0 };
  const liveV = liveSum.data?.[0] || { visitors: 0 };

  const byDay = new Map((daily.data || []).map((r) => [r.day, r]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
    series.push({ label: fmtDay(d), value: n(byDay.get(key)?.views) });
  }
  const chartData = days > 31 ? series.map((x, i) => ({ ...x, label: i % 7 === 0 ? x.label : "" })) : series;

  const trend = (cur, old) => { cur = n(cur); old = n(old); if (!old) return cur ? "▲ nieuw" : "—"; const d = Math.round(((cur - old) / old) * 100); return (d >= 0 ? "▲ +" : "▼ ") + d + "% vs vorige periode"; };
  const totalDev = n(s.mobile) + n(s.desktop);
  const mobilePct = totalDev ? Math.round((n(s.mobile) / totalDev) * 100) : 0;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Websiteverkeer</h1>
          <p className="mt-1 text-sm text-brand/50">Eigen, privacy-vriendelijke statistieken — geen cookies, geen externe tracker.</p>
        </div>
        <div className="inline-flex rounded-full border border-borderc bg-white p-1 text-sm font-bold">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/beheer/verkeer?d=${d}`} className={"rounded-full px-4 py-1.5 transition " + (days === d ? "bg-brand text-white" : "text-brand/60 hover:text-brand")}>{d}d</Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Bezoekers (${days}d)`} value={nl(s.visitors)} sub={trend(s.visitors, p.visitors)} />
        <Kpi label={`Paginaweergaves (${days}d)`} value={nl(s.views)} sub={trend(s.views, p.views)} />
        <Kpi label="Online nu (30 min)" value={nl(liveV.visitors)} accent />
        <Kpi label="Weergaves / bezoeker" value={n(s.visitors) ? (n(s.views) / n(s.visitors)).toFixed(1) : "0"} />
      </div>

      <div className="mt-6 rounded-2xl border border-borderc bg-white p-6">
        <p className="font-black text-brand">Paginaweergaves per dag</p>
        <div className="mt-4"><BarChart data={chartData} height={160} /></div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-borderc bg-white p-6">
          <p className="font-black text-brand">Populairste pagina's</p>
          <div className="mt-3 space-y-1.5">
            {(paths.data || []).map((r) => (
              <div key={r.path} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-semibold text-brand">{r.path}</span>
                <span className="shrink-0 text-brand/50">{nl(r.views)} <span className="text-brand/30">· {nl(r.visitors)} bez.</span></span>
              </div>
            ))}
            {(!paths.data || !paths.data.length) && <p className="text-sm text-brand/40">Nog geen data — verkeer verschijnt zodra bezoekers de site openen.</p>}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-borderc bg-white p-6">
            <p className="font-black text-brand">Herkomst</p>
            <div className="mt-3 space-y-1.5">
              {(refs.data || []).map((r) => (
                <div key={r.referrer_host} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-semibold text-brand">{r.referrer_host}</span>
                  <span className="shrink-0 text-brand/50">{nl(r.views)}</span>
                </div>
              ))}
              {(!refs.data || !refs.data.length) && <p className="text-sm text-brand/40">Nog geen data.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-borderc bg-white p-6">
            <p className="font-black text-brand">Toestel</p>
            <div className="mt-3"><Donut value={mobilePct} label="mobiel" sub={`${nl(s.mobile)} mobiel · ${nl(s.desktop)} desktop`} /></div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-brand/40">Privacy: geen cookies of persoonsgegevens — enkel een dagelijkse anonieme bezoeker-hash. Beheer- en coach-pagina's tellen niet mee.</p>
    </div>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-3xl font-black " + (accent ? "text-accentdark" : "text-brand")}>{value}</p>
      {sub && <p className="mt-1 text-xs text-brand/40">{sub}</p>}
    </div>
  );
}
