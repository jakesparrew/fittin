import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { upsertExercise, deleteExercise } from "../coaching-actions";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";

// An exercise is "incomplete" if a member would see gaps: no media, no category, no primary muscle,
// no instructions, or no equipment. Surfaced so the owner can complete the library gaps (W0).
const noMedia = (ex) => !ex.image_url && !ex.animation_url && !ex.video_url && !ex.frames;
const isIncomplete = (ex) =>
  noMedia(ex) || !ex.category || !(ex.primary_muscles?.length) || !(ex.instructions?.length) || !ex.equipment;
const missingBits = (ex) => [
  noMedia(ex) && "media", !ex.category && "categorie", !(ex.primary_muscles?.length) && "spier",
  !(ex.instructions?.length) && "uitleg", !ex.equipment && "materiaal",
].filter(Boolean);

export default async function Oefeningen({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const sp = (await searchParams) || {};
  const onlyIncomplete = sp.filter === "onvolledig";
  const { data: allExercises } = await supabase.from("exercises").select("*").eq("gym_id", gym.id).order("name");
  const incompleteCount = (allExercises || []).filter(isIncomplete).length;
  const exercises = onlyIncomplete ? (allExercises || []).filter(isIncomplete) : allExercises;
  // Edit mode: ?edit=<id> pre-fills the form so the owner can complete/correct an exercise in place.
  const editing = sp.edit ? (allExercises || []).find((e) => e.id === sp.edit) : null;
  const arr = (v) => (Array.isArray(v) ? v.join(", ") : "");

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-3xl font-black text-brand">Oefeningen</h1>
      <p className="mt-1 text-sm text-brand/50">De gym-bibliotheek: demo, doelspieren en uitleg. Leden zien deze in /oefeningen en hun schema.</p>

      {/* Completeness filter — helps the owner find + fix library gaps. */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-brand/60">{(allExercises || []).length} oefeningen</span>
        {incompleteCount > 0 && (
          <Link href={onlyIncomplete ? "/beheer/oefeningen" : "/beheer/oefeningen?filter=onvolledig"}
            className={"rounded-full px-3 py-1 text-xs font-bold transition " + (onlyIncomplete ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-700 hover:bg-amber-200")}>
            {onlyIncomplete ? "✕ toon alle" : `⚠ ${incompleteCount} onvolledig`}
          </Link>
        )}
      </div>

      <ActionForm key={editing?.id || "new"} action={upsertExercise} success="Oefening opgeslagen ✓" className="mt-6 scroll-mt-6 rounded-2xl border border-borderc bg-white p-5" id="form">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-black text-brand">{editing ? `Bewerk: ${editing.name}` : "Nieuwe oefening"}</p>
          {editing && <Link href="/beheer/oefeningen" className="text-xs font-bold text-brand/50 hover:text-brand">✕ annuleer bewerken</Link>}
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
        {(exercises || []).map((ex) => (
          <div key={ex.id} className="overflow-hidden rounded-2xl border border-borderc bg-white">
            <ExerciseMedia exercise={ex} thumb className="aspect-video w-full" rounded="rounded-none" />
            <div className="p-4">
              {isIncomplete(ex) && (
                <p className="mb-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700" title={"Ontbreekt: " + missingBits(ex).join(", ")}>⚠ onvolledig · {missingBits(ex).join(", ")}</p>
              )}
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
              <div className="mt-2 flex items-center gap-3">
                <Link href={`/beheer/oefeningen?edit=${ex.id}${onlyIncomplete ? "&filter=onvolledig" : ""}#form`} className="text-xs font-bold text-brand/60 hover:text-accentdark">✎ bewerken</Link>
                {ex.slug && <Link href={`/oefeningen/${ex.slug}`} target="_blank" className="text-xs font-semibold text-accentdark hover:underline">bekijk ↗</Link>}
              </div>
            </div>
          </div>
        ))}
        {(!exercises || exercises.length === 0) && <p className="text-sm text-brand/50">Nog geen oefeningen. Voeg er hierboven een toe.</p>}
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
