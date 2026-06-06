import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { coachCreateEvent, coachDeleteEvent } from "../coaching-actions";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function CoachEvents() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, gym, userId } = ctx;
  const { data: events } = await supabase
    .from("events")
    .select("id, title, starts_at, capacity, price_cents, status")
    .eq("gym_id", gym.id)
    .eq("coach_id", userId)
    .order("starts_at", { ascending: false });

  const hours = [];
  for (let h = gym.open_hour; h < gym.close_hour; h++) hours.push(h);

  return (
    <div className="px-8 py-8">
      <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Mijn events</h1>
      <p className="mt-1 text-sm text-brand/50">Stel een event voor — de beheerder keurt het goed voordat het live komt. Events worden altijd betaald (geen sessietegoed).</p>

      <form action={coachCreateEvent} className="mt-6 grid gap-3 rounded-2xl border border-borderc bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Lbl t="Titel" full><input name="title" required className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Beschrijving" full><textarea name="description" rows={2} className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Datum"><input name="date" type="date" required className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Uur"><select name="hour" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></Lbl>
        <Lbl t="Duur (min)"><input name="duration_min" type="number" defaultValue="60" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Plaatsen"><input name="capacity" type="number" defaultValue="12" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Prijs (€)"><input name="price_eur" defaultValue="0" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <div className="flex items-end"><button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">+ Voorstellen</button></div>
      </form>

      <div className="mt-6 space-y-3">
        {(events || []).map((ev) => (
          <div key={ev.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc bg-white p-5">
            <div>
              <p className="font-black text-brand">{ev.title}</p>
              <p className="mt-0.5 text-sm capitalize text-brand/50">{fmt(ev.starts_at)} · {ev.capacity} plaatsen · {ev.price_cents ? euro(ev.price_cents) : "gratis"}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={"rounded-full px-3 py-1 text-xs font-bold " + (ev.status === "approved" ? "bg-accent/15 text-accentdark" : "bg-paper text-brand/60")}>
                {ev.status === "approved" ? "goedgekeurd ✓" : "in afwachting"}
              </span>
              {ev.status === "pending" && (
                <form action={coachDeleteEvent}><input type="hidden" name="id" value={ev.id} /><button className="text-xs font-bold text-red-500 hover:underline">intrekken</button></form>
              )}
            </div>
          </div>
        ))}
        {(!events || events.length === 0) && <p className="text-sm text-brand/50">Nog geen events voorgesteld.</p>}
      </div>
    </div>
  );
}

function Lbl({ t, children, full }) {
  return (
    <label className={"block " + (full ? "sm:col-span-2 lg:col-span-3" : "")}>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>
      {children}
    </label>
  );
}
