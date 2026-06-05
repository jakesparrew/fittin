import { getCoachContext } from "@/lib/coach";
import { addOwnAvailability, deleteOwnAvailability } from "../actions";

export const dynamic = "force-dynamic";
const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const WD_FULL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

export default async function Beschikbaarheid() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, gym, userId } = ctx;
  const { data: avail } = await supabase
    .from("coach_availability")
    .select("*")
    .eq("coach_id", userId)
    .order("weekday")
    .order("from_hour");

  const byDay = {};
  for (const a of avail || []) (byDay[a.weekday] ||= []).push(a);
  const hours = [];
  for (let h = gym.open_hour; h <= gym.close_hour; h++) hours.push(h);

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Beschikbaarheid</h1>
      <p className="mt-1 text-sm text-brand/50">Stel in wanneer leden jou kunnen boeken voor personal training.</p>

      <form action={addOwnAvailability} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-5">
        <Lbl t="Dag">
          <select name="weekday" className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
            {WD_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Lbl>
        <Lbl t="Van"><select name="from_hour" defaultValue={9} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></Lbl>
        <Lbl t="Tot"><select name="to_hour" defaultValue={18} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></Lbl>
        <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">+ Toevoegen</button>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
          <div key={wd} className="rounded-2xl border border-borderc bg-white p-5">
            <p className="font-black capitalize text-brand">{WD_FULL[wd]}</p>
            <div className="mt-2 space-y-2">
              {(byDay[wd] || []).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-paper px-3 py-1.5 text-sm">
                  <span className="font-bold text-brand">{a.from_hour}:00 – {a.to_hour}:00</span>
                  <form action={deleteOwnAvailability}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="text-xs font-bold text-red-500 hover:underline">×</button>
                  </form>
                </div>
              ))}
              {(byDay[wd] || []).length === 0 && <p className="text-xs text-brand/30">Niet beschikbaar</p>}
            </div>
          </div>
        ))}
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
