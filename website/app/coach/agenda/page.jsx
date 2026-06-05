import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { cancelCoachBooking } from "../actions";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmtDay = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const fmtTime = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function Agenda() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, status, persons, coach_billing, coach_charge_cents, member:profiles!bookings_user_id_fkey(full_name), services(name)")
    .eq("coach_id", userId)
    .order("starts_at", { ascending: true });

  const now = Date.now();
  const all = (bookings || []).filter((b) => b.status === "bevestigd");
  const upcoming = all.filter((b) => new Date(b.starts_at).getTime() >= now);

  // group upcoming by day
  const byDay = {};
  for (const b of upcoming) {
    const k = b.starts_at.slice(0, 10);
    (byDay[k] ||= []).push(b);
  }
  const days = Object.keys(byDay).sort();

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Mijn agenda</h1>
          <p className="mt-1 text-sm text-brand/50">{upcoming.length} aankomende sessies.</p>
        </div>
        <Link href="/coach#boeken" className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand transition hover:opacity-90">+ Nieuwe sessie</Link>
      </div>

      {days.length === 0 ? (
        <p className="mt-6 text-sm text-brand/50">Nog geen geplande sessies.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {days.map((d) => (
            <div key={d}>
              <p className="text-sm font-black capitalize text-brand">{fmtDay(d + "T12:00:00")}</p>
              <div className="mt-2 space-y-2">
                {byDay[d].map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc bg-white p-4">
                    <div className="flex items-center gap-3">
                      <span className="rounded-md bg-accent px-2 py-0.5 text-sm font-black text-brand">{fmtTime(b.starts_at)}</span>
                      <div>
                        <p className="font-bold text-brand">{b.member?.full_name || "Client"}</p>
                        <p className="text-xs text-brand/50">{b.services?.name} · {b.persons}p</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand/60">
                        {b.coach_billing === "free" ? "gratis" : b.coach_billing === "credit" ? "1 sessie" : b.coach_billing === "invoice" ? euro(b.coach_charge_cents) : "—"}
                      </span>
                      <form action={cancelCoachBooking}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <button className="rounded-full border-2 border-borderc px-4 py-1.5 text-xs font-bold text-brand transition hover:border-red-300 hover:text-red-600">Annuleer</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
