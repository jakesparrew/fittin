"use client";
import { useState } from "react";
import ActionForm from "@/components/ui/ActionForm";
import { updateDripStep, deleteDripStep } from "@/app/beheer/newsletter-actions";

const strip = (html) => String(html || "").replace(/<[^>]+>/g, "");

// One drip step: shows a summary; click "Bewerk" to edit subject/delay/body inline.
export default function DripStepCard({ step, campaignId, sent = 0, openPct = "—" }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{step.step_no}</span>
          <div>
            <p className="font-bold text-brand">{step.subject}</p>
            <p className="text-xs text-brand/45">
              {step.delay_hours === 0 ? "Direct bij inschrijving" : `${step.delay_hours}u na inschrijving`}
              {step.step_no > 1 && step.delay_hours === 0 && <span className="ml-1 font-bold text-amber-600">⚠ stuurt meteen mee</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold text-brand/50">
          <span>{sent} verzonden</span>
          <span>{openPct} open</span>
          <button onClick={() => setEditing((e) => !e)} className="text-accentdark hover:underline">{editing ? "Sluit" : "Bewerk"}</button>
          <form action={deleteDripStep}><input type="hidden" name="id" value={step.id} /><input type="hidden" name="campaignId" value={campaignId} /><button className="text-red-500 hover:underline">×</button></form>
        </div>
      </div>

      {editing ? (
        <ActionForm action={updateDripStep} success="Stap opgeslagen ✓" className="mt-4 space-y-3">
          <input type="hidden" name="id" value={step.id} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Vertraging (uren)</span>
              <input name="delay_hours" type="number" min="0" defaultValue={step.delay_hours} className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Onderwerp</span>
              <input name="subject" required defaultValue={step.subject} className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Bericht</span>
            <textarea name="body" rows={6} defaultValue={step.body_html} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
          </label>
          <button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">Opslaan</button>
        </ActionForm>
      ) : (
        <p className="mt-2 line-clamp-2 text-sm text-brand/60">{strip(step.body_html)}</p>
      )}
    </div>
  );
}
