"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// First-run checklist for new coaches (Batch 2.8). New coaches land on a bare dashboard, invisible on
// /coaches until they complete their profile — nothing told them. This walks them through it. Fully
// dismissible (localStorage) and auto-hides once every step is done.
export default function CoachChecklist({ steps }) {
  const [dismissed, setDismissed] = useState(true); // start hidden → avoid a flash before we read storage
  useEffect(() => {
    try { setDismissed(localStorage.getItem("fittin_coach_checklist_dismissed") === "1"); } catch { setDismissed(false); }
  }, []);

  const done = steps.filter((s) => s.done).length;
  const allDone = done === steps.length;
  if (dismissed || allDone) return null;

  const dismiss = () => {
    try { localStorage.setItem("fittin_coach_checklist_dismissed", "1"); } catch {}
    setDismissed(true);
  };

  return (
    <section className="mt-6 rounded-3xl border-2 border-accent/40 bg-accent/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-accentdark">Aan de slag als coach</p>
          <h2 className="mt-1 text-xl font-black text-brand">Maak je profiel compleet ({done}/{steps.length})</h2>
          <p className="mt-1 text-sm text-brand/60">Zo verschijn je op de website en kunnen leden je vinden en boeken.</p>
        </div>
        <button onClick={dismiss} className="rounded-full px-3 py-1.5 text-xs font-bold text-brand/40 transition hover:text-brand">Verberg</button>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 rounded-2xl border border-borderc bg-white p-3">
            <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black " + (s.done ? "bg-accent text-brand" : "bg-paper text-brand/40")}>{s.done ? "✓" : ""}</span>
            <div className="min-w-0 flex-1">
              <p className={"text-sm font-bold " + (s.done ? "text-brand/50 line-through" : "text-brand")}>{s.label}</p>
              {!s.done && s.hint && <p className="text-xs text-brand/50">{s.hint}</p>}
            </div>
            {!s.done && (
              <Link href={s.href} className="shrink-0 rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90">{s.cta}</Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
