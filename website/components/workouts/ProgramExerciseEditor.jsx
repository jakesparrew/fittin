"use client";
import { useState } from "react";
import ActionForm from "@/components/ui/ActionForm";

// One program-exercise row in a builder: shows the prescription (sets/reps/rest + coach extras) and
// an inline edit form. Server actions (update/delete) are passed in so this works for both the coach
// (/coach/programmas) and admin (/beheer/programmas) builders. W2.
const letter = (g) => (g ? String.fromCharCode(64 + Number(g)) : null); // 1→A, 2→B …

export default function ProgramExerciseEditor({ pe, programId, updateAction, deleteAction, lastDate, showProgress }) {
  const [edit, setEdit] = useState(false);
  const sup = letter(pe.superset_group);
  const chips = [
    pe.target_weight_kg != null && `streef ${pe.target_weight_kg}kg`,
    pe.tempo && `tempo ${pe.tempo}`,
    pe.rpe != null && `RPE ${pe.rpe}`,
  ].filter(Boolean);

  return (
    <div className="rounded-xl bg-paper px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-bold text-brand">
          {sup && <span className="shrink-0 rounded bg-brand px-1.5 py-0.5 text-[10px] font-black text-white" title="Superset">{sup}</span>}
          <span className="truncate">{pe.exercises?.name}</span>
        </span>
        <div className="flex shrink-0 items-center gap-3 text-brand/60">
          {showProgress && (lastDate
            ? <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accentdark">✓ {lastDate}</span>
            : <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand/40">nog niet</span>)}
          <span className="whitespace-nowrap">{pe.sets ?? "–"} × {pe.reps ?? "–"}</span>
          <span className="whitespace-nowrap">{pe.rest_sec ?? "–"}s</span>
          <button type="button" onClick={() => setEdit((v) => !v)} className="text-xs font-bold text-brand/50 hover:text-accentdark" title="Bewerk">✎</button>
          <ActionForm action={deleteAction} success="Verwijderd ✓" className="inline">
            <input type="hidden" name="id" value={pe.id} />
            <input type="hidden" name="programId" value={programId} />
            <button className="text-xs font-bold text-red-500 hover:underline">×</button>
          </ActionForm>
        </div>
      </div>

      {(chips.length > 0 || pe.notes) && !edit && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => <span key={c} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-brand/55">{c}</span>)}
          {pe.notes && <span className="text-[11px] italic text-brand/50">“{pe.notes}”</span>}
        </div>
      )}

      {edit && (
        <ActionForm action={updateAction} success="Bijgewerkt ✓" className="mt-3 rounded-xl border border-borderc bg-white p-3">
          <input type="hidden" name="id" value={pe.id} />
          <input type="hidden" name="programId" value={programId} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <L t="Sets"><input name="sets" type="number" defaultValue={pe.sets ?? ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
            <L t="Reps"><input name="reps" type="number" defaultValue={pe.reps ?? ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
            <L t="Rust (s)"><input name="rest_sec" type="number" defaultValue={pe.rest_sec ?? ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
            <L t="Streef (kg)"><input name="target_weight_kg" defaultValue={pe.target_weight_kg ?? ""} placeholder="bv. 60" className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
            <L t="Tempo"><input name="tempo" defaultValue={pe.tempo ?? ""} placeholder="3-1-2" className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
            <L t="RPE (1-10)"><input name="rpe" type="number" min="1" max="10" defaultValue={pe.rpe ?? ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
            <L t="Superset #"><input name="superset_group" type="number" min="1" defaultValue={pe.superset_group ?? ""} placeholder="—" className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></L>
            <label className="col-span-2 block sm:col-span-3">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Notitie voor de client</span>
              <input name="notes" defaultValue={pe.notes ?? ""} placeholder="bv. strikt uitvoeren, laatste set tot falen" className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
            </label>
          </div>
          <div className="mt-2 flex gap-2">
            <button className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-brand">Opslaan</button>
            <button type="button" onClick={() => setEdit(false)} className="rounded-full px-3 py-1.5 text-xs font-bold text-brand/40 hover:text-brand">Annuleer</button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

function L({ t, children }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>{children}</label>;
}
