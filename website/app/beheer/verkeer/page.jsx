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

  const win = { p_from: from.toISOString(), p_to: now.toISOString() };
  const [sum, prev, daily, paths, refs, liveSum, events, boekenBezoekers, campagnes, referrals] = await Promise.all([
    admin.rpc("pv_summary", win),
    admin.rpc("pv_summary", { p_from: prevFrom.toISOString(), p_to: from.toISOString() }),
    admin.rpc("pv_daily", win),
    admin.rpc("pv_top_paths", { ...win, p_limit: 15 }),
    admin.rpc("pv_top_referrers", { ...win, p_limit: 12 }),
    admin.rpc("pv_summary", { p_from: live.toISOString(), p_to: now.toISOString() }),
    admin.rpc("pv_events", win),
    admin.rpc("pv_path_visitors", { ...win, p_path: "/boeken" }),
    admin.rpc("pv_campaign_funnel", { ...win, p_limit: 20 }),
    admin.from("referrals").select("status, referred_id, rewarded_at").eq("gym_id", ctx.gym.id).gte("created_at", from.toISOString()),
  ]);

  const s = sum.data?.[0] || { views: 0, visitors: 0, mobile: 0, desktop: 0 };
  const p = prev.data?.[0] || { views: 0, visitors: 0 };
  const liveV = liveSum.data?.[0] || { visitors: 0 };

  // --- Trechter: bezoeker → moment gekozen → betaling gestart → boeking bevestigd.
  // Bewust op unieke BEZOEKERS en niet op hits: booking_slot_chosen vuurt bij elke tik op een uur,
  // dus "hits" zou een twijfelende bezoeker als tien mensen tellen.
  const evtVisitors = new Map((events.data || []).map((r) => [r.event, n(r.visitors)]));
  const trechter = [
    { label: "Op /boeken", value: n(boekenBezoekers.data) },
    { label: "Moment gekozen", value: evtVisitors.get("booking_slot_chosen") || 0 },
    { label: "Betaling gestart", value: evtVisitors.get("checkout_started") || 0 },
    { label: "Boeking bevestigd", value: evtVisitors.get("booking_completed") || 0 },
  ];
  const heeftTrechter = trechter.some((t) => t.value > 0);

  // De campagnetrechter (0151) toont per advertentie: bezoekers → aanmeldingen → boekingen.
  // Blijft onzichtbaar zolang er geen UTM-link gebruikt is (declutter-regel: leeg = onzichtbaar).
  // Attributie is zonder cookie/pixel en dus per definitie een ondergrens — een klik en een boeking
  // op verschillende dagen matchen niet meer (zie de nota in 0151).
  const camps = (campagnes.data || []).filter((r) => r.utm_source && r.utm_source !== "(geen)");
  const advLabel = { zaal: "De hele zaal", niemand: "Niemand wacht", lidgeld: "Geen lidgeld", coach: "Met coach" };

  // Referral: gedeeld (beacon) → aangemeld met code (rij in referrals) → beloond.
  const refRows = referrals.data || [];
  const referral = {
    gedeeld: evtVisitors.get("referral_link_shared") || 0,
    aangemeld: refRows.filter((r) => r.referred_id).length,
    beloond: refRows.filter((r) => r.status === "rewarded" || r.rewarded_at).length,
  };

  const byDay = new Map((daily.data || []).map((r) => [r.day, r]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
    series.push({ label: fmtDay(d), value: n(byDay.get(key)?.views) });
  }
  const chartData = series; // BarChart thins labels itself on dense (daily) data

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

      {/* Van bezoek tot boeking. De enige plek waar verkeer en omzet elkaar raken: zonder deze kaart
          is elke euro advertentiebudget onmeetbaar. Blijft volledig weg zolang er niets gebeurd is. */}
      {(heeftTrechter || camps.length > 0 || referral.gedeeld > 0 || referral.aangemeld > 0) && (
        <div className="mt-6 rounded-2xl border border-borderc bg-white p-6">
          <p className="font-black text-brand">Van bezoek tot boeking</p>
          <p className="text-xs text-brand/50">Unieke bezoekers per stap ({days} dagen) — niet het aantal kliks.</p>

          {heeftTrechter && (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {trechter.map((stap, i) => {
                const vorige = i > 0 ? trechter[i - 1].value : 0;
                const val = trechter[i].value;
                const uitval = i > 0 && vorige > 0 ? Math.round(((vorige - val) / vorige) * 100) : null;
                return (
                  <div key={stap.label} className="rounded-xl bg-paper p-4">
                    <p className="text-2xl font-black text-brand">{nl(val)}</p>
                    <p className="text-xs font-bold text-brand/60">{stap.label}</p>
                    {uitval != null && (
                      <p className={"mt-0.5 text-[11px] font-semibold " + (uitval > 50 ? "text-amber-600" : "text-brand/40")}>
                        {uitval > 0 ? `− ${uitval}% haakt hier af` : "iedereen door"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {camps.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs font-bold uppercase tracking-wide text-lav">
                  <tr>
                    <th className="py-2 pr-3">Bron · campagne · advertentie</th>
                    <th className="py-2 pr-3 text-right">Bezoekers</th>
                    <th className="py-2 pr-3 text-right" title="Maakten dezelfde dag een account aan">Aanmeldingen</th>
                    <th className="py-2 text-right" title="Boekten dezelfde dag effectief een sessie">Boekingen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderc">
                  {camps.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 font-semibold text-brand">
                        {r.utm_source}
                        {r.utm_campaign && <span className="text-brand/40"> · {r.utm_campaign}</span>}
                        {r.utm_content && <span className="text-accentdark"> · {advLabel[r.utm_content] || r.utm_content}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-brand/70">{nl(r.visitors)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-brand/70">{nl(r.signups)}</td>
                      <td className="py-2 text-right font-bold tabular-nums text-accentdark">{nl(r.bookings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-brand/45">
                Toegeschreven zonder cookie of pixel — een klik en een boeking op verschillende dagen
                tellen niet mee, dus dit is een ondergrens.
              </p>
            </div>
          )}

          <p className="mt-5 border-t border-borderc pt-3 text-xs text-brand/50">
            Doorverwijzingen: <b className="text-brand">{nl(referral.gedeeld)}</b> gedeeld ·{" "}
            <b className="text-brand">{nl(referral.aangemeld)}</b> aangemeld met code ·{" "}
            <b className="text-brand">{nl(referral.beloond)}</b> beloond
          </p>
        </div>
      )}

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
