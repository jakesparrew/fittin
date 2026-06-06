import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { coachCreateProgram } from "../coaching-actions";

export const dynamic = "force-dynamic";

export default async function CoachProgrammas() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, gym, userId } = ctx;
  const { data: programs } = await supabase
    .from("programs")
    .select("id, name, is_template, member_id, member:profiles!programs_member_id_fkey(full_name), program_days(id)")
    .eq("gym_id", gym.id)
    .eq("coach_id", userId)
    .order("created_at", { ascending: false });

  return (
    <div className="px-8 py-8">
      <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Mijn programma's</h1>
      <p className="mt-1 text-sm text-brand/50">Maak trainingsschema's als template en wijs ze toe aan je clienten.</p>

      <form action={coachCreateProgram} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-5">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Naam programma</span>
          <input name="name" required placeholder="bv. Full body 3x/week" className="w-64 rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
        </label>
        <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">+ Nieuw programma</button>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(programs || []).map((p) => (
          <Link key={p.id} href={`/coach/programmas/${p.id}`} className="rounded-2xl border border-borderc bg-white p-5 transition hover:border-accent">
            <p className="font-black text-brand">{p.name}</p>
            <p className="mt-1 text-xs text-brand/50">{(p.program_days || []).length} dag(en)</p>
            <p className="mt-2 text-xs font-bold">
              {p.member_id ? <span className="text-accentdark">→ {p.member?.full_name || "client"}</span> : <span className="rounded-full bg-paper px-2 py-0.5 text-brand/50">Template</span>}
            </p>
          </Link>
        ))}
        {(!programs || programs.length === 0) && <p className="text-sm text-brand/50">Nog geen programma's. Maak er hierboven een.</p>}
      </div>
    </div>
  );
}
