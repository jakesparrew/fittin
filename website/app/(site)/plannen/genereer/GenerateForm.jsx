"use client";
import { useActionState } from "react";
import { generatePlan } from "./actions";

const field = "w-full rounded-xl border-2 border-borderc bg-white px-3 py-2.5 text-sm text-brand outline-none transition focus:border-accent";

export default function GenerateForm() {
  const [state, action, pending] = useActionState(generatePlan, {});
  return (
    <form action={action} className="mt-6 space-y-4 rounded-3xl border border-borderc bg-white p-6">
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Doel</span>
        <select name="goal" className={field}>
          <option value="spiermassa opbouwen">Spiermassa opbouwen</option>
          <option value="kracht">Sterker worden (kracht)</option>
          <option value="afvallen / vetverlies">Afvallen / vetverlies</option>
          <option value="fitter worden">Fitter / algemene conditie</option>
          <option value="uithouding">Uithouding</option>
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Dagen per week</span>
          <select name="days" defaultValue="3" className={field}>
            {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} dagen</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Niveau</span>
          <select name="level" className={field}>
            <option value="beginner">Beginner</option>
            <option value="gemiddeld">Gemiddeld</option>
            <option value="gevorderd">Gevorderd</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Beschikbaar materiaal</span>
        <select name="equipment" defaultValue="volledige gym" className={field}>
          <option value="volledige gym">Volledige gym</option>
          <option value="basis">Basis (dumbbells / kettlebells / banden)</option>
          <option value="lichaamsgewicht">Enkel lichaamsgewicht</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Aandachtspunten (optioneel)</span>
        <textarea name="notes" rows={3} placeholder="bv. knieklachten, focus op rug, weinig tijd…" className={field} />
      </label>

      {state?.error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className="w-full rounded-full bg-brand px-6 py-3.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60">
        {pending ? "✨ Schema wordt opgesteld…" : "✨ Genereer mijn schema"}
      </button>
      <p className="text-center text-xs text-brand/40">De AI stelt een schema op uit onze oefeningenbibliotheek. Je kan het daarna vrij aanpassen.</p>
    </form>
  );
}
