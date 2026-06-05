import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import {
  addProgramDay,
  addProgramExercise,
  deleteProgramExercise,
  assignProgram,
  deleteProgram,
} from "../../coaching-actions";

export const dynamic = "force-dynamic";

export default async function ProgramBuilder({ params }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const [{ data: program }, { data: exercises }, { data: members }] = await Promise.all([
    supabase
      .from("programs")
      .select(
        "id, name, is_template, member_id, program_days(id, day_no, name, program_exercises(id, sets, reps, rest_sec, exercises(name)))"
      )
      .eq("id", id)
      .single(),
    supabase.from("exercises").select("id, name").eq("gym_id", gym.id).order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).order("full_name"),
  ]);

  if (!program) return <div className="px-8 py-8">Programma niet gevonden. <Link href="/beheer/programmas" className="text-accentdark">Terug</Link></div>;
  const days = [...(program.program_days || [])].sort((a, b) => a.day_no - b.day_no);

  // Member progress: when assigned, show what the member has actually been logging/marking done.
  const lastByPe = {};
  let weekActive = 0;
  if (program.member_id) {
    const peIds = days.flatMap((d) => (d.program_exercises || []).map((pe) => pe.id));
    if (peIds.length) {
      const { data: mlogs } = await supabase
        .from("workout_logs")
        .select("program_exercise_id, logged_on, created_at")
        .eq("user_id", program.member_id)
        .in("program_exercise_id", peIds)
        .order("created_at", { ascending: false })
        .limit(200);
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      const wd = new Set();
      for (const l of mlogs || []) {
        if (!lastByPe[l.program_exercise_id]) lastByPe[l.program_exercise_id] = l.logged_on;
        if (new Date(l.created_at) >= weekAgo) wd.add(l.logged_on);
      }
      weekActive = wd.size;
    }
  }
  const fmtDay = (d) => (d ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(d)) : null);

  return (
    <div className="px-8 py-8">
      <Link href="/beheer/programmas" className="text-sm font-semibold text-brand/50 hover:text-brand">← Programma's</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black text-brand">{program.name}</h1>
        <form action={deleteProgram}>
          <input type="hidden" name="id" value={program.id} />
          <button className="text-xs font-bold text-red-500 hover:underline">Programma verwijderen</button>
        </form>
      </div>

      {/* Assign */}
      <form action={assignProgram} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-4">
        <input type="hidden" name="programId" value={program.id} />
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Toewijzen aan</span>
          <select name="memberId" defaultValue={program.member_id || ""} className="w-56 rounded-xl border-2 border-borderc px-3 py-2 text-sm">
            <option value="">— Template (niemand) —</option>
            {(members || []).map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
          </select>
        </label>
        <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Opslaan</button>
        {program.member_id && (
          <span className="ml-auto text-sm font-semibold text-brand/60">Voortgang: {weekActive} actieve {weekActive === 1 ? "dag" : "dagen"} (7d)</span>
        )}
      </form>

      {/* Days */}
      <div className="mt-6 space-y-5">
        {days.map((day) => {
          const exs = [...(day.program_exercises || [])];
          return (
            <div key={day.id} className="rounded-2xl border border-borderc bg-white p-6">
              <h2 className="font-black text-brand">{day.name || `Dag ${day.day_no}`}</h2>
              <div className="mt-3 space-y-2">
                {exs.map((pe) => (
                  <div key={pe.id} className="flex items-center justify-between rounded-xl bg-paper px-4 py-2.5 text-sm">
                    <span className="font-bold text-brand">{pe.exercises?.name}</span>
                    <div className="flex items-center gap-4 text-brand/60">
                      {program.member_id && (
                        lastByPe[pe.id]
                          ? <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accentdark">✓ {fmtDay(lastByPe[pe.id])}</span>
                          : <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-brand/40">nog niet</span>
                      )}
                      <span>{pe.sets ?? "–"} × {pe.reps ?? "–"}</span>
                      <span>{pe.rest_sec ?? "–"}s rust</span>
                      <form action={deleteProgramExercise}>
                        <input type="hidden" name="id" value={pe.id} />
                        <input type="hidden" name="programId" value={program.id} />
                        <button className="text-xs font-bold text-red-500 hover:underline">×</button>
                      </form>
                    </div>
                  </div>
                ))}
                {exs.length === 0 && <p className="text-xs text-brand/40">Nog geen oefeningen op deze dag.</p>}
              </div>

              <form action={addProgramExercise} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="programId" value={program.id} />
                <input type="hidden" name="dayId" value={day.id} />
                <select name="exerciseId" required className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
                  {(exercises || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <input name="sets" type="number" placeholder="sets" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
                <input name="reps" type="number" placeholder="reps" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
                <input name="rest_sec" type="number" placeholder="rust(s)" className="w-20 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
                <button className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-brand">+ Oefening</button>
              </form>
            </div>
          );
        })}
      </div>

      <form action={addProgramDay} className="mt-5">
        <input type="hidden" name="programId" value={program.id} />
        <button className="rounded-full border-2 border-dashed border-borderc px-6 py-3 text-sm font-bold text-brand transition hover:border-accent">
          + Dag toevoegen
        </button>
      </form>

      {(!exercises || exercises.length === 0) && (
        <p className="mt-6 rounded-xl bg-accent/10 p-3 text-sm font-semibold text-accentdark">
          Tip: voeg eerst oefeningen toe in <Link href="/beheer/oefeningen" className="underline">Oefeningen</Link>.
        </p>
      )}
    </div>
  );
}
