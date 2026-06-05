import { getAdminContext } from "@/lib/admin";
import { createChallenge, deleteChallenge } from "../community-actions";

export const dynamic = "force-dynamic";
const GOALS = [
  ["sessions", "Aantal sessies"],
  ["daluren", "Sessies in daluren"],
  ["streak", "Streak (weken)"],
];

export default async function Challenges() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const { data: challenges } = await supabase
    .from("challenges")
    .select("*")
    .eq("gym_id", gym.id)
    .order("created_at", { ascending: false });

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Challenges</h1>
      <p className="mt-1 text-sm text-brand/50">Maandelijkse uitdagingen, beloond in credits.</p>

      <form action={createChallenge} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-5">
        <Lbl t="Naam"><input name="name" required className="w-44 rounded-xl border-2 border-borderc px-3 py-2 text-sm" placeholder="12 sessies in juni" /></Lbl>
        <Lbl t="Doel">
          <select name="goal_type" className="rounded-xl border-2 border-borderc px-3 py-2 text-sm">
            {GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Lbl>
        <Lbl t="Aantal"><input name="goal_count" type="number" defaultValue="12" className="w-20 rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Start"><input name="starts_on" type="date" className="rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Einde"><input name="ends_on" type="date" className="rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <Lbl t="Beloning (credits)"><input name="reward_credits" type="number" defaultValue="5" className="w-20 rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></Lbl>
        <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">+ Challenge</button>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(challenges || []).map((c) => (
          <div key={c.id} className="rounded-2xl border border-borderc bg-white p-5">
            <div className="flex items-start justify-between">
              <p className="font-black text-brand">{c.name}</p>
              <form action={deleteChallenge}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-xs font-bold text-red-500 hover:underline">×</button>
              </form>
            </div>
            <p className="mt-1 text-xs text-brand/50">{c.goal_count}× {c.goal_type} · +{c.reward_credits} credits</p>
            {(c.starts_on || c.ends_on) && <p className="mt-1 text-xs text-brand/40">{c.starts_on} → {c.ends_on}</p>}
          </div>
        ))}
        {(!challenges || challenges.length === 0) && <p className="text-sm text-brand/50">Nog geen challenges.</p>}
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
