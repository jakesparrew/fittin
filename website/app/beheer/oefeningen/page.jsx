import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { upsertExercise, deleteExercise } from "../coaching-actions";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";

export default async function Oefeningen() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const { data: exercises } = await supabase.from("exercises").select("*").eq("gym_id", gym.id).order("name");

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-3xl font-black text-brand">Oefeningen</h1>
      <p className="mt-1 text-sm text-brand/50">De gym-bibliotheek: demo, doelspieren en uitleg. Leden zien deze in /oefeningen en hun schema.</p>

      <ActionForm action={upsertExercise} success="Oefening opgeslagen ✓" className="mt-6 rounded-2xl border border-borderc bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="name" label="Naam" required />
          <Field name="category" label="Categorie (bv. borst, rug, benen)" />
          <Field name="equipment" label="Materiaal (bv. Barbell, Machine)" />
          <Select name="difficulty" label="Niveau" options={[["", "—"], ["beginner", "Beginner"], ["intermediate", "Gemiddeld"], ["gevorderd", "Gevorderd"]]} />
          <Field name="primary_muscles" label="Hoofdspieren (komma-gescheiden)" />
          <Field name="secondary_muscles" label="Hulpspieren (komma-gescheiden)" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Area name="instructions" label="Uitvoering (één stap per regel)" rows={4} />
          <Area name="tips" label="Tip" rows={4} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field name="animation_url" label="Animatie-URL (GIF/MP4)" />
          <Field name="image_url" label="Afbeelding-URL (poster)" />
          <Field name="video_url" label="Video-URL (volledige demo)" />
        </div>
        <button className="mt-5 rounded-full bg-accent px-6 py-2.5 text-sm font-black text-brand">+ Oefening opslaan</button>
      </ActionForm>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(exercises || []).map((ex) => (
          <div key={ex.id} className="overflow-hidden rounded-2xl border border-borderc bg-white">
            <ExerciseMedia exercise={ex} thumb className="aspect-video w-full" rounded="rounded-none" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-black text-brand">{ex.name}</p>
                  <p className="text-xs text-brand/50">{[ex.primary_muscles?.[0] || ex.muscle, ex.equipment].filter(Boolean).join(" · ")}</p>
                </div>
                <ActionForm action={deleteExercise} success="Oefening verwijderd ✓">
                  <input type="hidden" name="id" value={ex.id} />
                  <button className="text-xs font-bold text-red-500 hover:underline">verwijder</button>
                </ActionForm>
              </div>
              {ex.slug && <Link href={`/oefeningen/${ex.slug}`} target="_blank" className="mt-2 inline-block text-xs font-semibold text-accentdark hover:underline">bekijk ↗</Link>}
            </div>
          </div>
        ))}
        {(!exercises || exercises.length === 0) && <p className="text-sm text-brand/50">Nog geen oefeningen. Voeg er hierboven een toe.</p>}
      </div>
    </div>
  );
}

function Field({ name, label, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <input name={name} required={required} className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent" />
    </label>
  );
}
function Area({ name, label, rows = 3 }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <textarea name={name} rows={rows} className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent" />
    </label>
  );
}
function Select({ name, label, options }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <select name={name} className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
