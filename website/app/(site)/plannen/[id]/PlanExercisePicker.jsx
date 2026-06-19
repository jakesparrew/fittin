"use client";
import { useState, useTransition } from "react";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";
import { searchExercises, addExerciseToDay } from "../actions";

const CATS = ["alle", "borst", "rug", "benen", "schouders", "armen", "core"];

// Search the gym library and add an exercise to this day. Stays open so several can be added.
export default function PlanExercisePicker({ dayId, programId }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("alle");
  const [results, setResults] = useState([]);
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState({});

  const run = (nq, ncat) => startTransition(async () => setResults(await searchExercises(nq, ncat)));

  const add = (exerciseId) => {
    const fd = new FormData();
    fd.set("dayId", dayId); fd.set("programId", programId); fd.set("exerciseId", exerciseId);
    startTransition(async () => {
      await addExerciseToDay(fd);
      setAdded((a) => ({ ...a, [exerciseId]: true }));
    });
  };

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); run("", "alle"); }} className="mt-2 w-full rounded-xl border-2 border-dashed border-borderc py-2.5 text-sm font-bold text-brand/60 transition hover:border-accent hover:text-brand">
        + Oefening toevoegen
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-2xl border border-borderc bg-paper p-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus value={q}
          onChange={(e) => { setQ(e.target.value); run(e.target.value, cat); }}
          placeholder="Zoek oefening…" aria-label="Zoek oefening"
          className="flex-1 rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none focus:border-accent"
        />
        <button onClick={() => setOpen(false)} className="rounded-full px-3 py-1.5 text-xs font-bold text-brand/50 hover:text-brand">sluit</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CATS.map((c) => (
          <button key={c} onClick={() => { setCat(c); run(q, c); }} aria-pressed={cat === c} className={"rounded-full px-2.5 py-1 text-[11px] font-bold capitalize transition " + (cat === c ? "bg-brand text-white" : "bg-white text-brand/60")}>{c}</button>
        ))}
      </div>
      <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
        {pending && results.length === 0 && <p className="py-3 text-center text-xs text-brand/40">Zoeken…</p>}
        {results.map((ex) => (
          <div key={ex.id} className="flex items-center gap-3 rounded-xl bg-white p-2">
            <ExerciseMedia exercise={ex} thumb className="h-10 w-10" rounded="rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-brand">{ex.name}</p>
              <p className="truncate text-[11px] text-brand/50">{[ex.primary_muscles?.[0] || ex.muscle, ex.equipment].filter(Boolean).join(" · ")}</p>
            </div>
            <button onClick={() => add(ex.id)} disabled={pending} className={"rounded-full px-3 py-1.5 text-xs font-black transition disabled:opacity-50 " + (added[ex.id] ? "bg-paper text-accentdark" : "bg-accent text-brand hover:opacity-90")}>
              {added[ex.id] ? "✓" : "+"}
            </button>
          </div>
        ))}
        {!pending && results.length === 0 && <p className="py-3 text-center text-xs text-brand/40">Geen resultaten.</p>}
      </div>
    </div>
  );
}
