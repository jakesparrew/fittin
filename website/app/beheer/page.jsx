import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSettled } from "@/lib/booking-status";

export const dynamic = "force-dynamic";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const tijd = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dag = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(new Date(iso));
const agoMin = (iso) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null);

export default async function BeheerDashboard() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const admin = createAdminClient();

  const now = new Date();
  const nowIso = now.toISOString();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Week = Monday-based (matches the booking calendar).
  const dow = (dayStart.getDay() + 6) % 7;
  const weekStart = new Date(dayStart.getTime() - dow * 86400000);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const d60 = new Date(Date.now() - 60 * 86400000);

  const [
    { count: memberCount },
    { data: monthPay },
    { data: prevPay },
    todayList,
    { data: unpaidRows },
    { count: pendingReq },
    { count: unreadInbox },
    { count: newMembers },
    { data: cronRows },
    { count: recentErrors },
    { data: lidRows },
    { data: recent30 },
    { count: openPayments },
    { data: memRows },
    { data: bk60 },
    { count: weekBk },
    { count: prevWeekBk },
    { data: weekPay },
    { data: prevWeekPay },
    { count: openReports },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("role", "lid"),
    supabase.from("payments").select("amount_cents, created_at").eq("gym_id", gym.id).gte("created_at", monthStart.toISOString()),
    supabase.from("payments").select("amount_cents").eq("gym_id", gym.id).gte("created_at", prevMonthStart.toISOString()).lt("created_at", monthStart.toISOString()),
    supabase.from("bookings").select("starts_at, persons, status, paid, price_cents, payment_source, member:profiles!bookings_user_id_fkey(full_name), coach:profiles!bookings_coach_id_fkey(full_name), services(name)").eq("gym_id", gym.id).gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString()).order("starts_at"),
    // Unpaid but confirmed upcoming bookings (real money owed) — the money queue.
    supabase.from("bookings").select("price_cents, payment_source, paid").eq("gym_id", gym.id).eq("status", "bevestigd").eq("paid", false).gte("starts_at", nowIso),
    supabase.from("coach_session_requests").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "pending"),
    // "Ongelezen" must count unread — not everything that isn't archived (that number never dropped).
    supabase.from("inbound_emails").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("archived", false).eq("read", false),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("role", "lid").gte("created_at", monthStart.toISOString()),
    admin.from("cron_runs").select("job, ok, created_at").order("created_at", { ascending: false }).limit(20),
    admin.from("client_errors").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 24 * 3600000).toISOString()),
    // At-risk: lid-accounts without a confirmed session in the last 30 days (booking-based estimate).
    supabase.from("profiles").select("id, full_name").eq("gym_id", gym.id).eq("role", "lid"),
    supabase.from("bookings").select("user_id").eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", new Date(Date.now() - 30 * 86400000).toISOString()).lt("starts_at", nowIso),
    // Open invoice posts (coach-credit grants etc.) — money the gym is still owed.
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "onbetaald"),
    // Subscriptions — the recurring backbone; drives the person-level action list below.
    supabase.from("memberships").select("user_id, status, cancel_at_period_end, current_period_end, started_at").eq("gym_id", gym.id),
    // 60 days of confirmed bookings → abo-candidates ("books often, pays full price") + past_due context.
    supabase.from("bookings").select("user_id, payment_source").eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", d60.toISOString()),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", weekStart.toISOString()),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", prevWeekStart.toISOString()).lt("starts_at", weekStart.toISOString()),
    supabase.from("payments").select("amount_cents").eq("gym_id", gym.id).gte("created_at", weekStart.toISOString()),
    supabase.from("payments").select("amount_cents").eq("gym_id", gym.id).gte("created_at", prevWeekStart.toISOString()).lt("created_at", weekStart.toISOString()),
    supabase.from("problem_reports").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "open"),
  ]);

  const nameOf = new Map((lidRows || []).map((m) => [m.id, m.full_name || "Lid"]));
  const revenue = (monthPay || []).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const revenueToday = (monthPay || []).filter((r) => new Date(r.created_at) >= dayStart).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const revenuePrev = (prevPay || []).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const weekRevenue = (weekPay || []).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const prevWeekRevenue = (prevWeekPay || []).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const today = (todayList.data || []).filter((b) => b.status === "bevestigd");
  const nextUp = today.find((b) => new Date(b.starts_at) >= now);
  // Only 'los'/'abo' bookings actually owe money; credit/free/invite are settled at creation.
  const unpaid = (unpaidRows || []).filter((b) => (b.payment_source === "los" || b.payment_source === "abo") && (b.price_cents || 0) > 0);
  const unpaidTotal = unpaid.reduce((a, b) => a + (b.price_cents || 0), 0);
  // At-risk = lid without a confirmed session in the last 30 days.
  const active30 = new Set((recent30 || []).map((b) => b.user_id));
  const atRiskCount = (lidRows || []).filter((m) => !active30.has(m.id)).length;

  // ---- Subscriptions ----
  const mems = memRows || [];
  const activeMems = mems.filter((m) => m.status === "actief");
  const pastDue = mems.filter((m) => m.status === "past_due");
  const ending = mems.filter((m) => m.status === "actief" && m.cancel_at_period_end);
  const mrr = activeMems.length * 1200; // € 12/mnd per actief abo

  // ---- Person-level action list (the "what do I DO today" queue) ----
  const bkCount = {}; // confirmed bookings per user, last 60d (incl. upcoming)
  for (const b of bk60 || []) if (b.user_id) bkCount[b.user_id] = (bkCount[b.user_id] || 0) + 1;
  const hasAbo = new Set(mems.filter((m) => m.status === "actief" || m.status === "past_due").map((m) => m.user_id));
  // Abo-candidates: leden met ≥3 los/kaart-boekingen in 60d zonder abo → concreet voorstel waard.
  const payCount = {};
  for (const b of bk60 || []) {
    if (!b.user_id || hasAbo.has(b.user_id) || !nameOf.has(b.user_id)) continue;
    if (b.payment_source === "los" || b.payment_source === "credit") payCount[b.user_id] = (payCount[b.user_id] || 0) + 1;
  }
  const candidates = Object.entries(payCount).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const personActions = [
    ...pastDue.map((m) => ({
      icon: "💳", tone: "warn",
      title: `Spreek ${nameOf.get(m.user_id) || "lid"} aan — abo-betaling mislukt`,
      sub: `Stripe probeert opnieuw; tot dan boekt ${nameOf.get(m.user_id) || "het lid"} weer aan € 15${bkCount[m.user_id] ? ` (${bkCount[m.user_id]} sessies in 60d)` : ""}. Help evt. de betaalmethode updaten.`,
      href: "/beheer/leden",
    })),
    ...ending.map((m) => ({
      icon: "👋", tone: "warn",
      title: `${nameOf.get(m.user_id) || "Lid"} zegde het abo op`,
      sub: `Loopt af op ${m.current_period_end ? dag(m.current_period_end) : "einde periode"} — vraag waarom en probeer te behouden.`,
      href: "/beheer/leden",
    })),
    ...candidates.map(([uid, n]) => ({
      icon: "⭐", tone: "tip",
      title: `Stel ${nameOf.get(uid)} een abonnement voor`,
      sub: `${n} sessies (los/kaart) in 60 dagen zonder abo — met een abo is elke sessie € 12.`,
      href: "/beheer/leden",
    })),
  ];

  // Latest run per cron job (health strip).
  const lastRun = {};
  for (const r of cronRows || []) if (!lastRun[r.job]) lastRun[r.job] = r;
  const access = lastRun["access_codes"];
  const activation = lastRun["activation"];
  const accessMin = agoMin(access?.created_at);
  const accessBad = access ? (access.ok === false || (accessMin != null && accessMin > 15)) : true;

  const dateLabel = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long" }).format(now);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Dashboard</h1>
          <p className="mt-1 text-sm capitalize text-brand/50">{dateLabel}</p>
        </div>
        <p className="text-sm text-brand/50">{gym?.name} · {gym?.open_hour}:00–{gym?.close_hour}:00</p>
      </header>

      {/* ============ ACTIE NODIG — persoonsgericht, bovenaan ============ */}
      <section className="mt-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-lav">Actie nodig{personActions.length ? ` · ${personActions.length}` : ""}</h2>
        {personActions.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-borderc bg-white p-5 text-sm text-brand/50">Niets dringends — alle abo's betalen en er zijn geen opzeggingen. 🎉</p>
        ) : (
          <div className="mt-3 space-y-2">
            {personActions.map((a, i) => (
              <Link key={i} href={a.href} className={"flex items-start gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm " + (a.tone === "warn" ? "border-amber-300 bg-amber-50" : "border-accent/40 bg-accent/5")}>
                <span className="text-xl leading-none">{a.icon}</span>
                <span className="min-w-0">
                  <span className="block font-black text-brand">{a.title}</span>
                  <span className="mt-0.5 block text-sm text-brand/60">{a.sub}</span>
                </span>
                <span className="ml-auto self-center font-black text-brand/30">→</span>
              </Link>
            ))}
          </div>
        )}
        {/* Kleinere werklijst-tellers (waren vroeger grote kaarten) */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip href="/beheer/boekingen?filter=onbetaald" warn={unpaid.length > 0} label={`Onbetaald: ${unpaid.length}${unpaid.length ? ` (${euro(unpaidTotal)})` : ""}`} />
          <Chip href="/beheer/coaches#aanvragen" warn={!!pendingReq} label={`Coach-aanvragen: ${pendingReq || 0}`} />
          <Chip href="/beheer/betalingen" warn={!!openPayments} label={`Open facturen: ${openPayments || 0}`} />
          <Chip href="/beheer/inbox" warn={!!unreadInbox} label={`Inbox: ${unreadInbox || 0}`} />
          <Chip href="/beheer/meldingen" warn={!!openReports} label={`Probleemmeldingen: ${openReports || 0}`} />
          <Chip href="/beheer/leden?filter=atrisk" label={`At-risk leden: ${atRiskCount}`} />
        </div>
      </section>

      {/* ============ DEZE WEEK & MAAND — de grote cijfers ============ */}
      <section className="mt-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-lav">Deze week & maand</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BigStat
            label="Abonnementen"
            value={activeMems.length}
            hint={`≈ ${euro(mrr)}/mnd${pastDue.length ? ` · ⚠ ${pastDue.length} betaling mislukt` : ""}${ending.length ? ` · ${ending.length} loopt af` : ""}`}
            warn={pastDue.length > 0}
            href="/beheer/leden"
          />
          <BigStat label="Boekingen deze week" value={weekBk || 0} hint={`vorige week ${prevWeekBk || 0}`} good={(weekBk || 0) >= (prevWeekBk || 0)} href="/beheer/boekingen" />
          <BigStat label="Ontvangen deze week" value={euro(weekRevenue)} hint={`vorige week ${euro(prevWeekRevenue)}`} good={weekRevenue >= prevWeekRevenue} href="/beheer/betalingen" />
          <BigStat
            label="Omzet deze maand"
            value={euro(revenue)}
            hint={revenuePrev ? `${revenue >= revenuePrev ? "▲" : "▼"} vs ${euro(revenuePrev)} vorige maand · ${newMembers ?? 0} nieuwe leden` : `${newMembers ?? 0} nieuwe leden`}
            good={revenue >= revenuePrev}
            href="/beheer/analytics"
          />
        </div>
      </section>

      {/* ============ VANDAAG — compact ============ */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-borderc bg-white p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-black text-brand">Vandaag in de zaal</h2>
            <p className="text-xs font-bold text-brand/45">
              {today.length} sessies · {euro(revenueToday)} ontvangen{nextUp ? ` · volgende ${tijd(nextUp.starts_at)} (${nextUp.member?.full_name || "Lid"})` : ""} · {memberCount ?? 0} leden
            </p>
          </div>
          {today.length === 0 ? (
            <p className="mt-4 text-sm text-brand/50">Nog geen boekingen voor vandaag.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {today.map((b, i) => {
                const settled = isSettled(b);
                return (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="rounded-md bg-accent px-2 py-0.5 font-black text-brand">{tijd(b.starts_at)}</span>
                      <span className="font-bold text-brand">{b.member?.full_name || "Lid"}</span>
                      {b.coach?.full_name && <span className="text-xs text-brand/45">· coach {b.coach.full_name}</span>}
                    </div>
                    <span className="flex items-center gap-2 text-brand/50">
                      {b.services?.name} · {b.persons}p
                      <span className={"rounded-full px-2 py-0.5 text-[10px] font-black " + (settled ? "bg-accent/15 text-accentdark" : "bg-red-100 text-red-600")}>{settled ? "betaald" : "onbetaald"}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-borderc bg-white p-6">
          <h2 className="font-black text-brand">Snel beheren</h2>
          <div className="mt-4 grid gap-2">
            <QuickLink href="/beheer/boekingen" label="Boekingskalender" />
            <QuickLink href="/beheer/leden" label="Leden & rollen" />
            <QuickLink href="/beheer/coaches" label="Coaches & toewijzingen" />
            <QuickLink href="/beheer/betalingen" label="Betalingen" />
            <QuickLink href="/beheer/diensten" label="Diensten & prijzen" />
          </div>
        </section>
      </div>

      {/* ============ SYSTEEM ============ */}
      <section className="mt-8 rounded-2xl border border-borderc bg-white p-5">
        <h2 className="text-xs font-black uppercase tracking-widest text-lav">Systeem</h2>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <Health label="Deurcode-cron" ok={!accessBad} detail={access ? `${accessMin} min geleden` : "nog niet gedraaid"} critical />
          <Health label="Activatie-cron" ok={activation ? activation.ok !== false : null} detail={activation ? `${agoMin(activation.created_at)} min geleden` : "nog niet gedraaid"} />
          <Health label="Client-fouten (24u)" ok={(recentErrors || 0) === 0} detail={`${recentErrors || 0} gemeld — bekijk in Meldingen`} href="/beheer/meldingen" />
        </div>
      </section>
    </div>
  );
}

function BigStat({ label, value, hint, good, warn, href }) {
  const body = (
    <>
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-3xl font-black " + (warn ? "text-amber-600" : good ? "text-accentdark" : "text-brand")}>{value}</p>
      {hint && <p className={"mt-1 text-xs " + (warn ? "font-bold text-amber-600" : "text-brand/45")}>{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className={"rounded-2xl border p-6 transition hover:-translate-y-0.5 hover:shadow-sm " + (warn ? "border-amber-300 bg-amber-50/60" : "border-borderc bg-white")}>{body}</Link>
  ) : (
    <div className="rounded-2xl border border-borderc bg-white p-6">{body}</div>
  );
}

function Chip({ href, label, warn }) {
  return (
    <Link href={href} className={"rounded-full border px-3.5 py-1.5 text-xs font-bold transition hover:-translate-y-0.5 " + (warn ? "border-amber-300 bg-amber-50 text-amber-700" : "border-borderc bg-white text-brand/60 hover:text-brand")}>
      {label}
    </Link>
  );
}

function Health({ label, ok, detail, critical, href }) {
  const dot = ok === null ? "bg-brand/20" : ok ? "bg-accent" : critical ? "bg-red-500" : "bg-amber-400";
  const inner = (
    <>
      <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + dot} />
      <div>
        <p className="font-bold text-brand">{label}</p>
        <p className="text-xs text-brand/50">{detail}</p>
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center gap-3 rounded-xl bg-paper px-4 py-3 transition hover:bg-accent/10">{inner}</Link>
  ) : (
    <div className="flex items-center gap-3 rounded-xl bg-paper px-4 py-3">{inner}</div>
  );
}

function QuickLink({ href, label }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm font-bold text-brand transition hover:bg-accent/15">
      {label}<span className="text-accentdark">→</span>
    </Link>
  );
}
