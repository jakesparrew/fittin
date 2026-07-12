import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { coachUpsertExercise, coachDeleteExercise } from "../coaching-actions";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";
import ActionForm from "@/components/ui/ActionForm";
import ConfirmSubmit from "@/components/ui/ConfirmSubmit";

export const dynamic = "force-dynamic";

export default async function CoachOefeningen({ searchParams }) {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, gym, userId } = ctx;
  const sp = (await searchParams) || {};

  // A coach manages their OWN exercises (coach_id = userId). Gym-wide ones are the admin's.
  const { data: mine } = await supabase.from("exercises").select("*").eq("gym_id", gym.id).eq("coach_id", userId).order("name");
  const editing = sp.edit ? (mine || []).find((e) => e.id === sp.edit) : null;
  const arr = (v) => (Array.isArray(v) ? v.join(", ") : "");

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link href="/coach/programmas" className="text-sm font-semibold text-brand/50 hover:text-brand">← Programma's</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Mijn oefeningen</h1>
      <p className="mt-1 text-sm text-brand/50">
        Maak je eigen oefeningen aan om in je programma's te gebruiken. De volledige gym-bibliotheek (± 900 oefeningen)
        blijft beschikbaar in de <Link href="/oefeningen" className="font-semibold text-accentdark hover:underline">oefeningenbibliotheek</Link> en in de programmabouwer.
      </p>

      <ActionForm key={editing?.id || "new"} action={coachUpsertExercise} success="Oefening opgeslagen ✓" className="mt-6 scroll-mt-6 rounded-2xl border border-borderc bg-white p-5" id="form">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-black text-brand">{editing ? `Bewerk: ${editing.name}` : "Nieuwe oefening"}</p>
          {editing && <Link href="/coach/oefeningen" className="text-xs font-bold text-brand/50 hover:text-brand">✕ annuleer bewerken</Link>}
        </div>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="name" label="Naam" required dv={editing?.name} />
          <Field name="category" label="Categorie (bv. borst, rug, benen)" dv={editing?.category} />
          <Field name="equipment" label="Materiaal (bv. Barbell, Machine)" dv={editing?.equipment} />
          <Select name="difficulty" label="Niveau" options={[["", "—"], ["beginner", "Beginner"], ["intermediate", "Gemiddeld"], ["gevorderd", "Gevorderd"]]} dv={editing?.difficulty} />
          <Field name="primary_muscles" label="Hoofdspieren (komma-gescheiden)" dv={arr(editing?.primary_muscles)} />
          <Field name="secondary_muscles" label="Hulpspieren (komma-gescheiden)" dv={arr(editing?.secondary_muscles)} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Area name="instructions" label="Uitvoering (één stap per regel)" rows={4} dv={Array.isArray(editing?.instructions) ? editing.instructions.join("\n") : ""} />
          <Area name="tips" label="Tip" rows={4} dv={editing?.tips} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field name="animation_url" label="Animatie-URL (GIF/MP4)" dv={editing?.animation_url} />
          <Field name="image_url" label="Afbeelding-URL (poster)" dv={editing?.image_url} />
          <Field name="video_url" label="Video-URL (volledige demo)" dv={editing?.video_url} />
        </div>
        <button className="mt-5 rounded-full bg-accent px-6 py-2.5 text-sm font-black text-brand">{editing ? "Wijzigingen opslaan" : "+ Oefening opslaan"}</button>
      </ActionForm>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(mine || []).map((ex) => (
          <div key={ex.id} className="overflow-hidden rounded-2xl border border-borderc bg-white">
            <ExerciseMedia exercise={ex} thumb className="aspect-video w-full" rounded="rounded-none" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-black text-brand">{ex.name}</p>
                  <p className="text-xs text-brand/50">{[ex.primary_muscles?.[0] || ex.muscle, ex.equipment].filter(Boolean).join(" · ")}</p>
                </div>
                <ActionForm action={coachDeleteExercise} success="Oefening verwijderd ✓">
                  <input type="hidden" name="id" value={ex.id} />
                  <ConfirmSubmit message={`"${ex.name}" verwijderen?`} className="text-xs font-bold text-red-500 hover:underline">verwijder</ConfirmSubmit>
                </ActionForm>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Link href={`/coach/oefeningen?edit=${ex.id}#form`} className="text-xs font-bold text-brand/60 hover:text-accentdark">✎ bewerken</Link>
                {ex.slug && <Link href={`/oefeningen/${ex.slug}`} target="_blank" className="text-xs font-semibold text-accentdark hover:underline">bekijk ↗</Link>}
              </div>
            </div>
          </div>
        ))}
        {(!mine || mine.length === 0) && (
          <p className="text-sm text-brand/50">Nog geen eigen oefeningen. Maak er hierboven een aan — of gebruik gewoon de gym-bibliotheek in je programma's.</p>
        )}
      </div>
    </div>
  );
}

function Field({ name, label, required, dv }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <input name={name} required={required} defaultValue={dv || ""} className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent" />
    </label>
  );
}
function Area({ name, label, rows = 3, dv }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <textarea name={name} rows={rows} defaultValue={dv || ""} className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent" />
    </label>
  );
}
function Select({ name, label, options, dv }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <select name={name} defaultValue={dv || ""} className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
