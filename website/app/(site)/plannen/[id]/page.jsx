import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";
import SubmitButton from "@/components/ui/SubmitButton";
import PlanExercisePicker from "./PlanExercisePicker";
import { renamePlan, setActivePlan, addDay, removeDay, updatePlanExercise, removePlanExercise } from "../actions";

export const dynamic = "force-dynamic";

export default async function PlanBuilder({ params }) {
  if (!isSupabaseConfigured) redirect("/");
  const { id } = await params;
  const { user } = await getSessionProfile();
  if (!user) redirect("/login?next=/plannen");

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("programs")
    .select("id, name, is_active, member_id, program_days(id, day_no, name, program_exercises(id, position, sets, reps, rest_sec, exercises(id, name, slug, muscle, primary_muscles, equipment, image_url, frames)))")
    .eq("id", id)
    .maybeSingle();
  if (!plan || plan.member_id !== user.id) notFound();

  const days = [...(plan.program_days || [])].sort((a, b) => a.day_no - b.day_no);

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <Link href="/plannen" className="text-sm font-bold text-brand/60 hover:text-brand">← Mijn plannen</Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <form action={renamePlan} className="flex items-center gap-2">
            <input type="hidden" name="id" value={plan.id} />
            <input name="name" defaultValue={plan.name} aria-label="Plannaam" className="rounded-xl border-2 border-borderc bg-white px-3 py-2 text-lg font-black text-brand outline-none focus:border-accent" />
            <SubmitButton className="rounded-full bg-paper px-3 py-2 text-xs font-bold text-brand">Hernoem</SubmitButton>
          </form>
          {plan.is_active ? (
            <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-black text-brand">ACTIEF PLAN</span>
          ) : (
            <form action={setActivePlan}><input type="hidden" name="id" value={plan.id} /><SubmitButton className="rounded-full bg-brand px-4 py-2 text-xs font-black text-white">Maak actief</SubmitButton></form>
          )}
        </div>

        <div className="mt-6 space-y-5">
          {days.map((day) => {
            const exs = [...(day.program_exercises || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
            return (
              <section key={day.id} className="rounded-3xl border border-borderc bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-brand">{day.name || `Dag ${day.day_no}`}</h2>
                  <form action={removeDay}>
                    <input type="hidden" name="dayId" value={day.id} /><input type="hidden" name="programId" value={plan.id} />
                    <button className="text-xs font-bold text-red-400 hover:text-red-600">dag verwijderen</button>
                  </form>
                </div>

                <div className="mt-3 space-y-2">
                  {exs.map((pe) => (
                    <div key={pe.id} className="rounded-2xl bg-paper p-3">
                      <div className="flex items-center gap-3">
                        <ExerciseMedia exercise={pe.exercises} thumb className="h-12 w-12" rounded="rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/oefeningen/${pe.exercises?.slug}`} target="_blank" className="block truncate font-bold text-brand hover:text-accentdark">{pe.exercises?.name}</Link>
                          <p className="truncate text-[11px] text-brand/50">{pe.exercises?.primary_muscles?.[0] || pe.exercises?.muscle || ""}</p>
                        </div>
                        <form action={removePlanExercise}>
                          <input type="hidden" name="peId" value={pe.id} /><input type="hidden" name="programId" value={plan.id} />
                          <button className="text-xs font-bold text-red-400 hover:text-red-600" aria-label="Verwijder oefening">✕</button>
                        </form>
                      </div>
                      <form action={updatePlanExercise} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="peId" value={pe.id} /><input type="hidden" name="programId" value={plan.id} />
                        <Mini name="sets" label="sets" defaultValue={pe.sets ?? ""} />
                        <Mini name="reps" label="reps" defaultValue={pe.reps ?? ""} />
                        <Mini name="rest_sec" label="rust (s)" defaultValue={pe.rest_sec ?? ""} w="w-20" />
                        <SubmitButton className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white">Opslaan</SubmitButton>
                      </form>
                    </div>
                  ))}
                  {exs.length === 0 && <p className="text-xs text-brand/40">Nog geen oefeningen. Voeg er een toe ↓</p>}
                </div>

                <PlanExercisePicker dayId={day.id} programId={plan.id} />
              </section>
            );
          })}
        </div>

        <form action={addDay} className="mt-5">
          <input type="hidden" name="programId" value={plan.id} />
          <SubmitButton className="w-full rounded-2xl border-2 border-dashed border-borderc py-3 text-sm font-bold text-brand/60 hover:border-accent hover:text-brand">+ Dag toevoegen</SubmitButton>
        </form>
      </div>
    </main>
  );
}

function Mini({ name, label, defaultValue, w = "w-16" }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <input name={name} defaultValue={defaultValue} inputMode="numeric" className={`${w} rounded-lg border-2 border-borderc bg-white px-2 py-1.5 text-sm text-brand outline-none focus:border-accent`} />
    </label>
  );
}
