import Link from "next/link";
import { getAdminContext } from "@/lib/admin";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const KIND = { booking: "Boeking", beurtenkaart: "Beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach-sessies", overig: "Overig" };

// A live activity stream of everything happening in the gym (derived from recent data).
export default async function AdminNotificaties() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const [bk, pay, ev, req, cpr] = await Promise.all([
    supabase.from("bookings").select("id, created_at, persons, member:profiles!bookings_user_id_fkey(full_name), services(name)").eq("gym_id", gym.id).eq("status", "bevestigd").gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    supabase.from("payments").select("id, created_at, amount_cents, kind, member:profiles!payments_user_id_fkey(full_name)").eq("gym_id", gym.id).gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    supabase.from("event_signups").select("id, created_at, paid, member:profiles!event_signups_user_id_fkey(full_name), event:events(title)").eq("gym_id", gym.id).gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    supabase.from("coach_session_requests").select("id, created_at, qty, status, coach:profiles!coach_session_requests_coach_id_fkey(full_name)").eq("gym_id", gym.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    supabase.from("coach_payment_requests").select("id, created_at, amount_cents, status, coach:profiles!coach_payment_requests_coach_id_fkey(full_name), client:profiles!coach_payment_requests_client_id_fkey(full_name)").eq("gym_id", gym.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20),
  ]);

  const items = [
    ...(bk.data || []).map((b) => ({ icon: "📅", text: `${b.member?.full_name || "Lid"} boekte ${b.services?.name || "een sessie"} (${b.persons}p)`, when: b.created_at })),
    ...(pay.data || []).map((p) => ({ icon: "💳", text: `${p.member?.full_name || "Iemand"} betaalde ${euro(p.amount_cents)} · ${KIND[p.kind] || p.kind}`, when: p.created_at })),
    ...(ev.data || []).filter((s) => s.paid).map((s) => ({ icon: "🎟️", text: `${s.member?.full_name || "Lid"} schreef in voor ${s.event?.title || "een event"}`, when: s.created_at })),
    ...(req.data || []).map((r) => ({ icon: "🧑‍🏫", text: `Coach ${r.coach?.full_name || ""} vroeg ${r.qty} sessies aan (${r.status})`, when: r.created_at })),
    ...(cpr.data || []).map((r) => ({ icon: "💶", text: `Betaalverzoek ${r.coach?.full_name || "coach"} → ${r.client?.full_name || "lid"}: ${euro(r.amount_cents)} (${r.status})`, when: r.created_at })),
  ].sort((a, b) => new Date(b.when) - new Date(a.when)).slice(0, 60);

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Notificaties</h1>
      <p className="mt-1 text-sm text-brand/50">Alles wat er leeft in je gym — boekingen, betalingen, inschrijvingen, coach-acties.</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-borderc bg-white">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-borderc px-5 py-3 last:border-0">
            <span className="text-lg">{it.icon}</span>
            <p className="flex-1 text-sm font-semibold text-brand">{it.text}</p>
            <span className="shrink-0 text-xs capitalize text-brand/40">{fmt(it.when)}</span>
          </div>
        ))}
        {items.length === 0 && <p className="px-5 py-10 text-center text-sm text-brand/40">Nog geen activiteit de afgelopen 30 dagen.</p>}
      </div>
    </div>
  );
}
