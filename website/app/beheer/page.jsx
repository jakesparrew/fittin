import Link from "next/link";
import { getAdminContext } from "@/lib/admin";

export const dynamic = "force-dynamic";

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const tijd = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function BeheerDashboard() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, profile, gym } = ctx;

  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const weekEnd = new Date(dayStart.getTime() + 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [{ count: memberCount }, { count: todayCount }, { count: weekCount }, paidRes, todayList] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("role", "lid"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString()),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", dayStart.toISOString()).lt("starts_at", weekEnd.toISOString()),
      supabase.from("bookings").select("price_cents").eq("gym_id", gym.id).eq("paid", true).gte("created_at", monthStart.toISOString()),
      supabase.from("bookings").select("starts_at, persons, status, member:profiles!bookings_user_id_fkey(full_name), services(name)").eq("gym_id", gym.id).gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString()).order("starts_at"),
    ]);

  const revenue = (paidRes.data || []).reduce((a, r) => a + (r.price_cents || 0), 0);
  const today = (todayList.data || []).filter((b) => b.status === "bevestigd");
  const dateLabel = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long" }).format(now);

  return (
    <div className="px-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Dashboard</h1>
          <p className="mt-1 text-sm capitalize text-brand/50">{dateLabel}</p>
        </div>
        <p className="text-sm text-brand/50">{gym?.name} · {gym?.open_hour}:00–{gym?.close_hour}:00</p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Boekingen vandaag" value={todayCount ?? 0} />
        <Stat label="Actieve leden" value={memberCount ?? 0} />
        <Stat label="Boekingen deze week" value={weekCount ?? 0} />
        <Stat label="Omzet (maand)" value={euro(revenue)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-borderc bg-white p-6 lg:col-span-2">
          <h2 className="font-black text-brand">Vandaag in de zaal</h2>
          {today.length === 0 ? (
            <p className="mt-4 text-sm text-brand/50">Nog geen boekingen voor vandaag.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {today.map((b, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="rounded-md bg-accent px-2 py-0.5 font-black text-brand">{tijd(b.starts_at)}</span>
                    <span className="font-bold text-brand">{b.member?.full_name || "Lid"}</span>
                  </div>
                  <span className="text-brand/50">{b.services?.name} · {b.persons}p</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-borderc bg-white p-6">
          <h2 className="font-black text-brand">Snel beheren</h2>
          <div className="mt-4 grid gap-2">
            <QuickLink href="/beheer/boekingen" label="Boekingskalender" />
            <QuickLink href="/beheer/leden" label="Leden & rollen" />
            <QuickLink href="/beheer/diensten" label="Diensten & prijzen" />
            <QuickLink href="/beheer/instellingen" label="Openingsuren & instellingen" />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className="mt-2 text-2xl font-black text-brand">{value}</p>
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
