import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSettled } from "@/lib/booking-status";

export const dynamic = "force-dynamic";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const tijd = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
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
    supabase.from("profiles").select("id").eq("gym_id", gym.id).eq("role", "lid"),
    supabase.from("bookings").select("user_id").eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", new Date(Date.now() - 30 * 86400000).toISOString()).lt("starts_at", nowIso),
    // Open invoice posts (coach-credit grants etc.) — money the gym is still owed.
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "onbetaald"),
  ]);

  const revenue = (monthPay || []).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const revenueToday = (monthPay || []).filter((r) => new Date(r.created_at) >= dayStart).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const revenuePrev = (prevPay || []).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const today = (todayList.data || []).filter((b) => b.status === "bevestigd");
  const nextUp = today.find((b) => new Date(b.starts_at) >= now);
  // Only 'los'/'abo' bookings actually owe money; credit/free/invite are settled at creation.
  const unpaid = (unpaidRows || []).filter((b) => (b.payment_source === "los" || b.payment_source === "abo") && (b.price_cents || 0) > 0);
  const unpaidTotal = unpaid.reduce((a, b) => a + (b.price_cents || 0), 0);
  // At-risk = lid without a confirmed session in the last 30 days.
  const active30 = new Set((recent30 || []).map((b) => b.user_id));
  const atRiskCount = (lidRows || []).filter((m) => !active30.has(m.id)).length;
  const actionCount = unpaid.length + (pendingReq || 0) + (unreadInbox || 0) + (openPayments || 0);

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
          <h1 className="text-3xl font-black text-brand">Vandaag</h1>
          <p className="mt-1 text-sm capitalize text-brand/50">{dateLabel}</p>
        </div>
        <p className="text-sm text-brand/50">{gym?.name} · {gym?.open_hour}:00–{gym?.close_hour}:00</p>
      </header>

      {/* ============ VANDAAG ============ */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ontvangen vandaag" value={euro(revenueToday)} accent />
        <Stat label="Sessies vandaag" value={today.length} />
        <Stat label="Volgende sessie" value={nextUp ? tijd(nextUp.starts_at) : "—"} hint={nextUp ? (nextUp.member?.full_name || "Lid") : "niets meer gepland"} />
        <Stat label="Actieve leden" value={memberCount ?? 0} />
      </div>

      {/* ============ ACTIE NODIG ============ */}
      <section className="mt-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-lav">Actie nodig{actionCount > 0 ? ` · ${actionCount}` : ""}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <ActionCard href="/beheer/boekingen?filter=onbetaald" tone={unpaid.length ? "warn" : "ok"} label="Onbetaalde sessies" value={unpaid.length} sub={unpaid.length ? euro(unpaidTotal) + " openstaand" : "alles betaald"} />
          <ActionCard href="/beheer/coaches#aanvragen" tone={pendingReq ? "warn" : "ok"} label="Coach-aanvragen" value={pendingReq || 0} sub={pendingReq ? "wachten op jou" : "niets open"} />
          <ActionCard href="/beheer/betalingen" tone={openPayments ? "warn" : "ok"} label="Open facturen" value={openPayments || 0} sub={openPayments ? "nog te innen" : "alles geïnd"} />
          <ActionCard href="/beheer/inbox" tone={unreadInbox ? "warn" : "ok"} label="Inbox" value={unreadInbox || 0} sub={unreadInbox ? "ongelezen" : "leeg"} />
          <ActionCard href="/beheer/leden?filter=atrisk" tone={atRiskCount ? "neutral" : "ok"} label="Leden met risico" value={atRiskCount} sub="30d geen sessie" />
        </div>
      </section>

      {/* ============ DEZE MAAND ============ */}
      <section className="mt-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-lav">Deze maand</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Stat label="Omzet" value={euro(revenue)} hint={revenuePrev ? `vorige maand ${euro(revenuePrev)}` : null} />
          <Stat label="Nieuwe leden" value={newMembers ?? 0} />
          <Stat label="t.o.v. vorige maand" value={(revenue >= revenuePrev ? "▲ " : "▼ ") + (revenuePrev ? Math.round(((revenue - revenuePrev) / revenuePrev) * 100) + "%" : "—")} accent={revenue >= revenuePrev} />
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-borderc bg-white p-6 lg:col-span-2">
          <h2 className="font-black text-brand">Vandaag in de zaal</h2>
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
          <Health label="Client-fouten (24u)" ok={(recentErrors || 0) === 0} detail={`${recentErrors || 0} gemeld`} />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent, hint }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + (accent ? "text-accentdark" : "text-brand")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-brand/45">{hint}</p>}
    </div>
  );
}

function ActionCard({ href, label, value, sub, tone }) {
  const ring = tone === "warn" ? "border-amber-300 bg-amber-50" : "border-borderc bg-white";
  const num = tone === "warn" ? "text-amber-600" : "text-brand";
  return (
    <Link href={href} className={"relative rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-sm " + ring}>
      {/* Subtle attention pulse on cards that genuinely need action (motion-safe: static dot otherwise). */}
      {tone === "warn" && (
        <span className="absolute right-4 top-4 flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
      )}
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + num}>{value}</p>
      <p className="mt-1 text-xs text-brand/45">{sub}</p>
    </Link>
  );
}

function Health({ label, ok, detail, critical }) {
  const dot = ok === null ? "bg-brand/20" : ok ? "bg-accent" : critical ? "bg-red-500" : "bg-amber-400";
  return (
    <div className="flex items-center gap-3 rounded-xl bg-paper px-4 py-3">
      <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + dot} />
      <div>
        <p className="font-bold text-brand">{label}</p>
        <p className="text-xs text-brand/50">{detail}</p>
      </div>
    </div>
  );
}

function QuickLink({ href, label }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm font-bold text-brand transition hover:bg-accent/15">
      {label}<span className="text-accentdark">→</span>
    </Link>
  );
}
