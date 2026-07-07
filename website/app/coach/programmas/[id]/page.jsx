import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  coachAddProgramDay,
  coachAddProgramExercise,
  coachDeleteProgramExercise,
  coachAssignProgram,
  coachDeleteProgram,
  coachQuickExercise,
} from "../../coaching-actions";
import ExercisePicker from "@/components/admin/ExercisePicker";
import SearchSelect from "@/components/admin/SearchSelect";
import ActionForm from "@/components/ui/ActionForm";
import ConfirmSubmit from "@/components/ui/ConfirmSubmit";

export const dynamic = "force-dynamic";

export default async function CoachProgramBuilder({ params }) {
  const { id } = await params;
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, gym, userId } = ctx;

  const [{ data: program }, { data: exercises }, { data: links }] = await Promise.all([
    supabase
      .from("programs")
      .select(
        "id, name, coach_id, is_template, member_id, program_days(id, day_no, name, program_exercises(id, sets, reps, rest_sec, exercises(name)))"
      )
      .eq("id", id)
      .single(),
    supabase.from("exercises").select("id, name").eq("gym_id", gym.id).order("name"),
    supabase.from("coach_clients").select("client:profiles!coach_clients_client_id_fkey(id, full_name, email)").eq("coach_id", userId).eq("status", "accepted"),
  ]);

  // Ownership guard: a coach can only open their own programs.
  if (!program || program.coach_id !== userId) {
    return <div className="px-4 py-6 md:px-8 md:py-8">Programma niet gevonden. <Link href="/coach/programmas" className="text-accentdark">Terug</Link></div>;
  }
  const clients = (links || []).map((l) => l.client).filter(Boolean);
  const days = [...(program.program_days || [])].sort((a, b) => a.day_no - b.day_no);

  // Member progress when assigned (read via service role — the coach can't read a client's logs under RLS).
  const lastByPe = {};
  let weekActive = 0;
  if (program.member_id) {
    const peIds = days.flatMap((d) => (d.program_exercises || []).map((pe) => pe.id));
    if (peIds.length) {
      const { data: mlogs } = await createAdminClient()
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
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link href="/coach/programmas" className="text-sm font-semibold text-brand/50 hover:text-brand">← Programma's</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black text-brand">{program.name}</h1>
        <form action={coachDeleteProgram}>
          <input type="hidden" name="id" value={program.id} />
          <ConfirmSubmit message={program.member_id ? "Dit programma verwijderen? De client verliest dit schema onder 'Training'." : "Dit sjabloon verwijderen?"} className="text-xs font-bold text-red-500 hover:underline">Programma verwijderen</ConfirmSubmit>
        </form>
      </div>

      {/* Assign to one of my clients (a copy is made — the template stays reusable) */}
      <ActionForm action={coachAssignProgram} success="Programma toegewezen ✓" className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-4">
        <input type="hidden" name="programId" value={program.id} />
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Toewijzen aan client</span>
          <SearchSelect name="memberId" defaultValue={program.member_id || ""} placeholder="— Sjabloon (niemand) —" options={[{ value: "", label: "— Sjabloon (niemand) —" }, ...clients.map((c) => ({ value: c.id, label: c.full_name || c.email }))]} />
        </label>
        <ConfirmSubmit message="Programma toewijzen? De gekozen client krijgt een kopie onder 'Training' en een melding." className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Opslaan</ConfirmSubmit>
        {program.member_id && (
          <span className="ml-auto text-sm font-semibold text-brand/60">Voortgang: {weekActive} actieve {weekActive === 1 ? "dag" : "dagen"} (7d)</span>
        )}
      </ActionForm>

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
                      <ActionForm action={coachDeleteProgramExercise} success="Verwijderd ✓">
                        <input type="hidden" name="id" value={pe.id} />
                        <input type="hidden" name="programId" value={program.id} />
                        <button className="text-xs font-bold text-red-500 hover:underline">×</button>
                      </ActionForm>
                    </div>
                  </div>
                ))}
                {exs.length === 0 && <p className="text-xs text-brand/40">Nog geen oefeningen op deze dag.</p>}
              </div>

              <ActionForm action={coachAddProgramExercise} success="Oefening toegevoegd ✓" className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="programId" value={program.id} />
                <input type="hidden" name="dayId" value={day.id} />
                <ExercisePicker name="exerciseId" options={(exercises || []).map((e) => ({ id: e.id, name: e.name }))} addAction={coachQuickExercise} />
                <input name="sets" type="number" placeholder="sets" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
                <input name="reps" type="number" placeholder="reps" className="w-16 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
                <input name="rest_sec" type="number" placeholder="rust(s)" className="w-20 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
                <button className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-brand">+ Oefening</button>
              </ActionForm>
            </div>
          );
        })}
      </div>

      <ActionForm action={coachAddProgramDay} success="Dag toegevoegd ✓" className="mt-5">
        <input type="hidden" name="programId" value={program.id} />
        <button className="rounded-full border-2 border-dashed border-borderc px-6 py-3 text-sm font-bold text-brand transition hover:border-accent">
          + Dag toevoegen
        </button>
      </ActionForm>

      {(!exercises || exercises.length === 0) && (
        <p className="mt-6 rounded-xl bg-accent/10 p-3 text-sm font-semibold text-accentdark">
          Tip: gebruik “+ Oefening” om meteen een oefening aan te maken, of blader de volledige bibliotheek op <Link href="/oefeningen" className="underline">Oefeningen</Link>.
        </p>
      )}
    </div>
  );
}
