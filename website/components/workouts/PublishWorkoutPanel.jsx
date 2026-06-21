"use client";
import { useState } from "react";
import { setWorkoutPublic } from "@/app/coach/coaching-actions";

const toast = (type, msg) => { try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {} };
const CATS = ["borst", "schouders", "rug", "benen", "armen", "core", "full"];
const LEVELS = ["Beginner", "Gemiddeld", "Gevorderd"];

// Staff panel to publish a (template) program as a public follow-along workout on /workouts.
export default function PublishWorkoutPanel({ program }) {
  const [pub, setPub] = useState(!!program.is_public);
  const [slug, setSlug] = useState(program.slug || "");
  const [busy, setBusy] = useState(false);

  async function run(publish, form) {
    setBusy(true);
    const fd = new FormData(form);
    fd.set("programId", program.id);
    fd.set("publish", String(publish));
    const r = await setWorkoutPublic(fd);
    setBusy(false);
    if (r?.error) { toast("error", r.error); return; }
    toast("success", r.message || "Opgeslagen ✓");
    setPub(publish);
    if (r.slug) setSlug(r.slug);
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-accent/40 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-black text-brand">
          Publieke workout {pub && <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-brand">LIVE</span>}
        </p>
        {pub && slug && <a href={`/workouts/${slug}`} className="text-sm font-bold text-accentdark hover:underline">Bekijk op /workouts →</a>}
      </div>
      <p className="mt-0.5 text-xs text-brand/60">Publiceer dit sjabloon zodat iedereen het kan volgen op de Workouts-pagina.</p>
      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(true, e.currentTarget); }}>
        <input name="subtitle" defaultValue={program.subtitle || ""} placeholder="Ondertitel (1 zin)" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm sm:col-span-2" />
        <select name="level" defaultValue={program.level || "Gemiddeld"} className="rounded-lg border-2 border-borderc px-3 py-2 text-sm">{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
        <select name="category" defaultValue={program.category || "borst"} className="rounded-lg border-2 border-borderc px-3 py-2 text-sm">{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <input name="est_minutes" type="number" min="5" max="180" defaultValue={program.est_minutes || 45} placeholder="duur (min)" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
        <input name="focus" defaultValue={program.focus || ""} placeholder="Focus (bv. Kracht + massa borst)" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
        <textarea name="description" defaultValue={program.description || ""} placeholder="Intro (paar zinnen)" rows={2} className="rounded-lg border-2 border-borderc px-3 py-2 text-sm sm:col-span-2" />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" disabled={busy} className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90 disabled:opacity-50">
            {busy ? "Bezig…" : pub ? "Bijwerken" : "Publiceren"}
          </button>
          {pub && (
            <button type="button" disabled={busy} onClick={(e) => run(false, e.currentTarget.closest("form"))} className="rounded-full border-2 border-borderc px-5 py-2.5 text-sm font-bold text-brand transition hover:border-red-300 hover:text-red-600">
              Offline halen
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
