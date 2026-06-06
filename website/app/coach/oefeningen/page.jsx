import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { coachUpsertExercise, coachDeleteExercise } from "../coaching-actions";

export const dynamic = "force-dynamic";

export default async function CoachOefeningen() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, gym, userId } = ctx;
  // Your own exercises + the gym-wide library (coach_id null, made by the gym).
  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, name, muscle, video_url, coach_id")
    .eq("gym_id", gym.id)
    .order("name");
  const mine = (exercises || []).filter((e) => e.coach_id === userId);
  const gymWide = (exercises || []).filter((e) => !e.coach_id);

  return (
    <div className="px-8 py-8">
      <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Mijn oefeningen</h1>
      <p className="mt-1 text-sm text-brand/50">Bouw je eigen oefeningenbibliotheek — gebruik ze in je programma's.</p>

      <form action={coachUpsertExercise} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-5">
        <Field name="name" label="Naam" required w="w-48" />
        <Field name="muscle" label="Spiergroep" w="w-40" />
        <Field name="video_url" label="Video-URL (optioneel)" w="w-56" />
        <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">+ Toevoegen</button>
      </form>

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-lav">Mijn oefeningen ({mine.length})</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mine.map((ex) => (
          <div key={ex.id} className="rounded-2xl border border-borderc bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-black text-brand">{ex.name}</p>
                {ex.muscle && <p className="text-xs text-brand/50">{ex.muscle}</p>}
              </div>
              <form action={coachDeleteExercise}>
                <input type="hidden" name="id" value={ex.id} />
                <button className="text-xs font-bold text-red-500 hover:underline">verwijder</button>
              </form>
            </div>
            {ex.video_url && <a href={ex.video_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-accentdark hover:underline">video ↗</a>}
          </div>
        ))}
        {mine.length === 0 && <p className="text-sm text-brand/50">Nog geen eigen oefeningen. Voeg er hierboven een toe.</p>}
      </div>

      {gymWide.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-lav">Gym-bibliotheek ({gymWide.length})</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {gymWide.map((ex) => (
              <span key={ex.id} className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand/70">{ex.name}{ex.muscle ? ` · ${ex.muscle}` : ""}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Field({ name, label, required, w = "w-40" }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <input name={name} required={required} className={`${w} rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent`} />
    </label>
  );
}
