import { getAdminContext } from "@/lib/admin";
import { upsertExercise, deleteExercise } from "../coaching-actions";

export const dynamic = "force-dynamic";

export default async function Oefeningen() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const { data: exercises } = await supabase
    .from("exercises")
    .select("*")
    .eq("gym_id", gym.id)
    .order("name");

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-black text-brand">Oefeningen</h1>
      <p className="mt-1 text-sm text-brand/50">De oefeningenbibliotheek voor programma's.</p>

      <form action={upsertExercise} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-5">
        <Field name="name" label="Naam" required w="w-48" />
        <Field name="muscle" label="Spiergroep" w="w-40" />
        <Field name="video_url" label="Video-URL (optioneel)" w="w-56" />
        <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand">+ Toevoegen</button>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(exercises || []).map((ex) => (
          <div key={ex.id} className="rounded-2xl border border-borderc bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-black text-brand">{ex.name}</p>
                {ex.muscle && <p className="text-xs text-brand/50">{ex.muscle}</p>}
              </div>
              <form action={deleteExercise}>
                <input type="hidden" name="id" value={ex.id} />
                <button className="text-xs font-bold text-red-500 hover:underline">verwijder</button>
              </form>
            </div>
            {ex.video_url && (
              <a href={ex.video_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-accentdark hover:underline">
                video ↗
              </a>
            )}
          </div>
        ))}
        {(!exercises || exercises.length === 0) && (
          <p className="text-sm text-brand/50">Nog geen oefeningen. Voeg er hierboven een toe.</p>
        )}
      </div>
    </div>
  );
}

function Field({ name, label, required, w = "w-40" }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <input
        name={name}
        required={required}
        className={`${w} rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent`}
      />
    </label>
  );
}
