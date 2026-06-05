import { getAdminContext } from "@/lib/admin";
import { createEvent, deleteEvent } from "../community-actions";

export const dynamic = "force-dynamic";
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function Events() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data: events } = await supabase
    .from("events")
    .select("*, event_signups(id)")
    .eq("gym_id", gym.id)
    .gte("starts_at", today.toISOString())
    .order("starts_at");

  const hours = [];
  for (let h = gym.open_hour; h < gym.close_hour; h++) hours.push(h);
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Events &amp; groepslessen</h1>
      <p className="mt-1 text-sm text-brand/50">Vul daluren met events — leden schrijven zich in.</p>

      <form action={createEvent} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-5">
        <Lbl t="Titel"><input name="title" required className="w-44 rounded-xl border-2 border-borderc px-3 py-2 text-sm" placeholder="Yoga ochtend" /></Lbl>
        <Lbl t="Datum"><input name="date" type="date" required defaultValue={todayStr} className="rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Uur">
          <select name="hour" className="rounded-xl border-2 border-borderc px-3 py-2 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
        </Lbl>
        <Lbl t="Duur (min)"><input name="duration_min" type="number" defaultValue="60" className="w-20 rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Plaatsen"><input name="capacity" type="number" defaultValue="12" className="w-20 rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Prijs (€)"><input name="price_eur" defaultValue="0" className="w-20 rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">+ Event</button>
      </form>

      <div className="mt-6 space-y-3">
        {(events || []).map((ev) => (
          <div key={ev.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borderc bg-white p-5">
            <div>
              <p className="font-black text-brand">{ev.title}</p>
              <p className="mt-1 text-sm capitalize text-brand/50">{fmt(ev.starts_at)} · {(ev.event_signups || []).length}/{ev.capacity} ingeschreven · {ev.price_cents ? euro(ev.price_cents) : "gratis"}</p>
            </div>
            <form action={deleteEvent}>
              <input type="hidden" name="id" value={ev.id} />
              <button className="text-xs font-bold text-red-500 hover:underline">verwijder</button>
            </form>
          </div>
        ))}
        {(!events || events.length === 0) && <p className="text-sm text-brand/50">Nog geen komende events.</p>}
      </div>
    </div>
  );
}

function Lbl({ t, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>
      {children}
    </label>
  );
}
