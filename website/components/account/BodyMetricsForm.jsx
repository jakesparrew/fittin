"use client";
import { useState } from "react";
import ActionForm from "@/components/ui/ActionForm";
import SubmitButton from "@/components/ui/SubmitButton";
import { logBodyMetrics } from "@/app/(site)/account/actions";

// Weight-first body logging. "Gewicht vandaag" is the prominent daily field; lengte + doelgewicht
// are set once and shown read-only with an edit toggle (they only submit when you open the editor,
// so the action keeps the stored values otherwise).
export default function BodyMetricsForm({ heightCm, goalKg }) {
  const hasProfile = !!heightCm || !!goalKg;
  const [edit, setEdit] = useState(!hasProfile); // open the editor automatically the first time

  return (
    <ActionForm action={logBodyMetrics} success="Opgeslagen ✓" className="mt-4">
      {/* Main daily input */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-paper p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Gewicht vandaag (kg)</span>
          <input name="weight_kg" type="number" step="0.1" inputMode="decimal" required placeholder="bv. 78.5"
            className="w-36 rounded-xl border-2 border-accent/50 bg-white px-3 py-3 text-2xl font-black text-brand outline-none focus:border-accent" />
        </label>
        <SubmitButton className="rounded-full bg-accent px-7 py-3 text-sm font-black text-brand">Opslaan ✓</SubmitButton>
        <p className="w-full text-xs text-brand/50">Log je gewicht regelmatig — zo zie je je evolutie en krijg je straks AI-coachingtips op maat. 💪</p>
      </div>

      {/* Profile: length + goal — set once, editable */}
      {!edit ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-brand/60">
          <span>Lengte: <strong className="text-brand">{heightCm ? `${heightCm} cm` : "niet ingesteld"}</strong></span>
          <span>Doelgewicht: <strong className="text-brand">{goalKg ? `${goalKg} kg` : "niet ingesteld"}</strong></span>
          <button type="button" onClick={() => setEdit(true)} className="font-bold text-accentdark hover:underline">✎ aanpassen</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Lengte (cm)</span>
            <input name="height_cm" type="number" defaultValue={heightCm || ""} placeholder="178" className="w-24 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Doelgewicht (kg)</span>
            <input name="goal_weight_kg" type="number" step="0.1" defaultValue={goalKg || ""} placeholder="75" className="w-28 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
          </label>
          <span className="text-xs text-brand/40">Eénmalig instellen — wordt samen met je gewicht opgeslagen.</span>
        </div>
      )}
    </ActionForm>
  );
}
