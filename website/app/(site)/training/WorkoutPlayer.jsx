"use client";
import { useState, useEffect, useTransition } from "react";
import ExerciseDetail from "@/components/exercises/ExerciseDetail";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";
import { logExercise, toggleExerciseDone } from "./actions";

const fmtSets = (sets) =>
  sets && sets.length
    ? sets.map((s) => `${s.reps ?? "–"}${s.weight_kg ? `×${s.weight_kg}kg` : ""}`).join(", ")
    : null;
const supLetter = (g) => (g ? String.fromCharCode(64 + Number(g)) : null);

export default function WorkoutPlayer({ days }) {
  const [openDetail, setOpenDetail] = useState(null);
  const [rest, setRest] = useState(null); // { left, total }
  const [feedback, setFeedback] = useState({});
  const [busyPe, setBusyPe] = useState(null);
  const [, startTransition] = useTransition();

  // Prefill set inputs from the last session (or the target) so logging is fast.
  const [entries, setEntries] = useState(() => {
    const m = {};
    for (const d of days) for (const pe of d.exercises) {
      const n = Math.max(1, pe.sets || pe.lastSets?.length || 1);
      const last = pe.lastSets || [];
      m[pe.peId] = Array.from({ length: n }, (_, i) => ({
        reps: last[i]?.reps ?? pe.reps ?? "",
        weight_kg: last[i]?.weight_kg ?? (pe.targetWeight != null ? pe.targetWeight : ""),
      }));
    }
    return m;
  });

  useEffect(() => {
    if (!rest) return;
    if (rest.left <= 0) { setRest(null); return; }
    const t = setTimeout(() => setRest((r) => (r ? { ...r, left: r.left - 1 } : r)), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  const setRow = (peId, i, field, val) =>
    setEntries((e) => ({ ...e, [peId]: (e[peId] || []).map((r, idx) => (idx === i ? { ...r, [field]: val } : r)) }));
  const addRow = (peId) => setEntries((e) => ({ ...e, [peId]: [...(e[peId] || []), { reps: "", weight_kg: "" }] }));
  const removeRow = (peId) => setEntries((e) => ({ ...e, [peId]: (e[peId] || []).length > 1 ? e[peId].slice(0, -1) : e[peId] || [] }));
  // One-tap "repeat last session" — fill every set with last time's reps + weight.
  const repeatLast = (peId, lastSets) => {
    if (!lastSets?.length) return;
    setEntries((e) => ({ ...e, [peId]: lastSets.map((s) => ({ reps: s.reps ?? "", weight_kg: s.weight_kg ?? "" })) }));
  };

  const doLog = (peId) => {
    const fd = new FormData();
    fd.set("peId", peId);
    fd.set("sets_json", JSON.stringify(entries[peId] || []));
    setBusyPe(peId);
    startTransition(async () => {
      // A failed save = lost training data; show it in red instead of an always-green span.
      let res;
      try { res = await logExercise(fd); } catch { res = { error: "Opslaan mislukt — probeer opnieuw." }; }
      setFeedback((f) => ({ ...f, [peId]: res?.error ? { msg: res.error, err: true } : { msg: res?.pr ? "🏆 Nieuw PR!" : "Gelogd ✓" } }));
      setBusyPe(null);
    });
  };
  const doToggle = (peId) => {
    const fd = new FormData();
    fd.set("peId", peId);
    setBusyPe(peId);
    startTransition(async () => {
      try {
        const res = await toggleExerciseDone(fd);
        if (res?.error) window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type: "error", msg: res.error } }));
      } catch {
        window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type: "error", msg: "Opslaan mislukt — probeer opnieuw." } }));
      }
      setBusyPe(null);
    });
  };

  return (
    <div className="space-y-6">
      {days.map((day) => {
        const done = day.exercises.filter((pe) => pe.doneToday).length;
        return (
          <section key={day.id} className="rounded-3xl border border-borderc bg-white p-5 md:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-brand">{day.name || `Dag ${day.day_no}`}</h2>
              <span className="text-xs font-bold text-brand/40">{done}/{day.exercises.length} klaar</span>
            </div>
            <div className="mt-4 space-y-3">
              {day.exercises.map((pe) => {
                const open = openDetail === pe.peId;
                const rows = entries[pe.peId] || [];
                const last = fmtSets(pe.lastSets);
                const topLast = (pe.lastSets || []).reduce((m, s) => Math.max(m, s.weight_kg || 0), 0);
                return (
                  <div key={pe.peId} className={"rounded-2xl border p-4 transition " + (pe.doneToday ? "border-accent/40 bg-accent/5" : "border-borderc bg-paper")}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => setOpenDetail(open ? null : pe.peId)} className="shrink-0" aria-label={`Bekijk uitvoering van ${pe.exercise?.name}`}>
                        <ExerciseMedia exercise={pe.exercise} thumb className="h-16 w-16" rounded="rounded-xl" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {pe.supersetGroup && <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-black text-white" title="Superset — doe deze back-to-back">Superset {supLetter(pe.supersetGroup)}</span>}
                          <p className="font-black text-brand">{pe.exercise?.name}</p>
                          {pe.pr > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-black text-white">PR {pe.pr}kg</span>}
                          {pe.doneToday && <span className="text-xs font-bold text-accentdark">✓ klaar</span>}
                        </div>
                        <p className="text-xs text-brand/50">
                          doel: {pe.sets ?? "–"} × {pe.reps ?? "–"}{pe.targetWeight != null ? ` @ ${pe.targetWeight}kg` : ""}{pe.rest_sec ? ` · ${pe.rest_sec}s rust` : ""}
                          {pe.tempo ? ` · tempo ${pe.tempo}` : ""}{pe.rpe != null ? ` · RPE ${pe.rpe}` : ""}
                          {pe.exercise?.primary_muscles?.[0] ? ` · ${pe.exercise.primary_muscles[0]}` : pe.exercise?.muscle ? ` · ${pe.exercise.muscle}` : ""}
                        </p>
                        {pe.notes && <p className="mt-1 rounded-lg bg-accent/10 px-2 py-1 text-xs font-semibold text-accentdark">💬 {pe.notes}</p>}
                        {last && (
                          <p className="mt-0.5 text-xs text-brand/40">
                            vorige keer: {last}
                            {topLast > 0 && <span className="font-bold text-accentdark"> · probeer {topLast + 2.5} kg →</span>}
                          </p>
                        )}
                        <button onClick={() => setOpenDetail(open ? null : pe.peId)} className="mt-1 text-xs font-bold text-accentdark hover:underline">
                          {open ? "Verberg uitvoering" : "Bekijk uitvoering →"}
                        </button>
                      </div>
                    </div>

                    {open && (
                      <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-borderc">
                        <ExerciseDetail exercise={pe.exercise} compact />
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      {rows.map((row, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-12 text-xs font-bold text-brand/40">Set {i + 1}</span>
                          <input inputMode="numeric" value={row.reps} onChange={(e) => setRow(pe.peId, i, "reps", e.target.value)} placeholder="reps" aria-label={`Set ${i + 1} reps`} className="w-20 rounded-lg border-2 border-borderc bg-white px-2 py-1.5 text-sm text-brand outline-none focus:border-accent" />
                          <input inputMode="decimal" value={row.weight_kg} onChange={(e) => setRow(pe.peId, i, "weight_kg", e.target.value)} placeholder="kg" aria-label={`Set ${i + 1} gewicht`} className="w-20 rounded-lg border-2 border-borderc bg-white px-2 py-1.5 text-sm text-brand outline-none focus:border-accent" />
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button onClick={() => addRow(pe.peId)} className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand/70 hover:text-brand">+ set</button>
                        {rows.length > 1 && <button onClick={() => removeRow(pe.peId)} className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand/40 hover:text-brand">− set</button>}
                        {last && <button onClick={() => repeatLast(pe.peId, pe.lastSets)} className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand/70 hover:text-brand" title="Vul in met vorige sessie">↻ herhaal vorige</button>}
                        {pe.rest_sec ? <button onClick={() => setRest({ left: pe.rest_sec, total: pe.rest_sec })} className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand/70 hover:text-brand">⏱ rust {pe.rest_sec}s</button> : null}
                        <button disabled={busyPe === pe.peId} onClick={() => doLog(pe.peId)} className="rounded-full bg-accent px-5 py-1.5 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-50">Log{rows.length > 1 ? " sets" : ""}</button>
                        <button disabled={busyPe === pe.peId} onClick={() => doToggle(pe.peId)} className="rounded-full border-2 border-borderc px-4 py-1.5 text-xs font-bold text-brand transition hover:border-lav disabled:opacity-50">{pe.doneToday ? "Ongedaan" : "Klaar ✓"}</button>
                        {feedback[pe.peId] && <span className={`text-xs font-bold ${feedback[pe.peId].err ? "text-red-500" : "text-accentdark"}`}>{feedback[pe.peId].msg}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {day.exercises.length === 0 && <p className="text-xs text-brand/40">Nog geen oefeningen op deze dag.</p>}
            </div>
          </section>
        );
      })}

      {rest && (
        <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[min(20rem,90vw)] items-center justify-between gap-3 rounded-full bg-brand px-5 py-3 text-white shadow-xl shadow-brand/30">
          <span className="text-sm font-bold">Rust</span>
          <span className="text-xl font-black tabular-nums">{rest.left}s</span>
          <button onClick={() => setRest(null)} className="text-xs font-bold text-lav hover:text-white">stop</button>
        </div>
      )}
    </div>
  );
}
