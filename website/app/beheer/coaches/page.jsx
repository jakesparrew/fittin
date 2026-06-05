import { getAdminContext } from "@/lib/admin";
import { addCoachAvailability, deleteCoachAvailability } from "../coaching-actions";

export const dynamic = "force-dynamic";
const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];

export default async function Coaches() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const [{ data: coaches }, { data: avail }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).eq("role", "coach").order("full_name"),
    supabase.from("coach_availability").select("*").eq("gym_id", gym.id).order("weekday"),
  ]);

  const byCoach = {};
  for (const a of avail || []) (byCoach[a.coach_id] ||= []).push(a);

  const hours = [];
  for (let h = gym.open_hour; h < gym.close_hour; h++) hours.push(h);

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Coaches &amp; beschikbaarheid</h1>
      <p className="mt-1 text-sm text-brand/50">Stel in wanneer elke coach beschikbaar is voor personal training.</p>

      <div className="mt-6 space-y-4">
        {(coaches || []).map((c) => (
          <div key={c.id} className="rounded-2xl border border-borderc bg-white p-6">
            <p className="font-black text-brand">{c.full_name || c.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(byCoach[c.id] || []).map((a) => (
                <span key={a.id} className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">
                  {WD[a.weekday]} {a.from_hour}:00–{a.to_hour}:00
                  <form action={deleteCoachAvailability} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <button className="text-red-500 hover:underline">×</button>
                  </form>
                </span>
              ))}
              {(byCoach[c.id] || []).length === 0 && <span className="text-xs text-brand/40">Nog geen beschikbaarheid.</span>}
            </div>

            <form action={addCoachAvailability} className="mt-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="coachId" value={c.id} />
              <Lbl t="Dag">
                <select name="weekday" className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
                  {WD.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </Lbl>
              <Lbl t="Van">
                <select name="from_hour" defaultValue={gym.open_hour} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{hours.map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
              </Lbl>
              <Lbl t="Tot">
                <select name="to_hour" defaultValue={gym.close_hour} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{[...hours, gym.close_hour].map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
              </Lbl>
              <button className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-brand">+ Toevoegen</button>
            </form>
          </div>
        ))}
        {(!coaches || coaches.length === 0) && (
          <p className="rounded-xl bg-accent/10 p-4 text-sm font-semibold text-accentdark">
            Nog geen coaches. Zet een lid op rol "coach" via Leden.
          </p>
        )}
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
