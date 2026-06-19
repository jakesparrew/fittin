"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";
import { logWorkoutSet, toggleWorkoutDone, saveWorkoutToPlans } from "@/app/(site)/workouts/actions";

const toast = (type, msg) => { try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {} };
const SECTIONS = ["Warming-up", "Hoofdoefening", "Accessoire", "Finisher"];
const firstInt = (s, d = 10) => { const m = String(s || "").match(/\d+/); return m ? parseInt(m[0], 10) : d; };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function WorkoutFollow({ workout, lastByPe = {}, doneToday = {}, isLoggedIn }) {
  const exercises = workout.exercises || [];
  const [done, setDone] = useState(() => ({ ...doneToday }));
  const [rest, setRest] = useState(null); // {sec, total}

  const total = exercises.length;
  const doneCount = exercises.filter((e) => done[e.id]).length;

  const groups = [];
  for (const s of SECTIONS) {
    const items = exercises.filter((e) => (e.section || "Hoofdoefening") === s);
    if (items.length) groups.push({ section: s, items });
  }
  const other = exercises.filter((e) => !SECTIONS.includes(e.section || "Hoofdoefening"));
  if (other.length) groups.push({ section: "Overig", items: other });

  return (
    <div className="mx-auto max-w-2xl px-5 pb-28 pt-6">
      {/* sticky progress */}
      <div className="sticky top-16 z-20 -mx-5 mb-5 border-y border-borderc bg-paper/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center justify-between text-sm font-bold text-brand">
          <span>Workout-voortgang</span>
          <span>{doneCount}/{total} klaar</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-borderc">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.section} className="mb-7">
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-brand/50">{g.section}</h3>
          <div className="space-y-3">
            {g.items.map((e) => (
              <ExerciseCard
                key={e.id}
                pe={e}
                last={lastByPe[e.id]}
                done={!!done[e.id]}
                isLoggedIn={isLoggedIn}
                onToggleDone={(v) => setDone((d) => ({ ...d, [e.id]: v }))}
                onRest={(sec) => setRest({ sec, total: sec })}
              />
            ))}
          </div>
        </section>
      ))}

      {/* save / finish */}
      <div className="mt-8 rounded-3xl border border-borderc bg-white p-5 text-center">
        {doneCount >= total && total > 0 ? (
          <p className="text-lg font-black text-accentdark">Workout voltooid! 🎉 Top gedaan.</p>
        ) : (
          <p className="text-sm text-brand/60">Vink elke oefening af terwijl je traint — bovenaan zie je je voortgang.</p>
        )}
        {isLoggedIn ? (
          <form
            action={async (fd) => { const r = await saveWorkoutToPlans(fd); toast(r?.error ? "error" : "success", r?.error || r?.message || "Opgeslagen ✓"); }}
            className="mt-4"
          >
            <input type="hidden" name="programId" value={workout.id} />
            <button className="rounded-full border-2 border-borderc px-6 py-3 text-sm font-bold text-brand transition hover:border-accent">＋ Bewaar in mijn plannen</button>
          </form>
        ) : (
          <Link href="/login?mode=signup" className="mt-4 inline-block rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Maak account om te loggen</Link>
        )}
      </div>

      {rest && <RestPill rest={rest} onClose={() => setRest(null)} />}
    </div>
  );
}

function ExerciseCard({ pe, last, done, isLoggedIn, onToggleDone, onRest }) {
  const ex = pe.exercise || {};
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const targetReps = firstInt(pe.rep_text, firstInt(pe.reps, 10));
  const nSets = Math.max(1, pe.sets || 3);
  const [rows, setRows] = useState(() =>
    Array.from({ length: nSets }, (_, i) => ({
      reps: last && last[i] ? String(last[i].reps ?? targetReps) : String(targetReps),
      weight_kg: last && last[i] ? String(last[i].weight_kg ?? "") : "",
    }))
  );

  const setRow = (i, k, v) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  const addRow = () => setRows((r) => [...r, { reps: String(targetReps), weight_kg: r.length ? r[r.length - 1].weight_kg : "" }]);
  const delRow = (i) => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : r));

  async function logSets() {
    if (!isLoggedIn) { toast("error", "Log in om je sets bij te houden."); return; }
    setBusy(true);
    const fd = new FormData();
    fd.set("programExerciseId", pe.id);
    fd.set("sets", JSON.stringify(rows));
    const r = await logWorkoutSet(fd);
    setBusy(false);
    if (r?.error) { toast("error", r.error); return; }
    toast("success", r.message || "Gelogd ✓");
    onToggleDone(true);
  }

  async function quickDone() {
    if (!isLoggedIn) { toast("error", "Log in om je workout bij te houden."); return; }
    const next = !done;
    onToggleDone(next);
    const fd = new FormData();
    fd.set("programExerciseId", pe.id);
    fd.set("done", String(next));
    const r = await toggleWorkoutDone(fd);
    if (r?.error) { toast("error", r.error); onToggleDone(!next); }
  }

  return (
    <div className={"overflow-hidden rounded-3xl border bg-white transition " + (done ? "border-accent" : "border-borderc")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-3 text-left">
        <div className="h-16 w-16 shrink-0">
          <ExerciseMedia exercise={ex} thumb rounded="rounded-2xl" className="h-16 w-16" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-black text-brand">{ex.name || "Oefening"}</p>
          <p className="mt-0.5 text-sm text-brand/55">
            {pe.sets} × {pe.rep_text || pe.reps} · rust {pe.rest_sec}s{pe.tempo ? ` · tempo ${pe.tempo}` : ""}
          </p>
        </div>
        <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black " + (done ? "bg-accent text-brand" : "bg-paper text-brand/40")}>✓</span>
      </button>

      {open && (
        <div className="border-t border-borderc px-4 pb-4 pt-3">
          <div className="overflow-hidden rounded-2xl">
            <ExerciseMedia exercise={ex} className="aspect-video w-full" rounded="rounded-2xl" />
          </div>
          {pe.notes && <p className="mt-3 rounded-2xl bg-accent/10 p-3 text-sm font-semibold text-brand">💡 {pe.notes}</p>}
          {Array.isArray(ex.instructions) && ex.instructions.length > 0 && (
            <ol className="mt-3 space-y-1.5 pl-5 text-sm text-brand/70" style={{ listStyle: "decimal" }}>
              {ex.instructions.slice(0, 5).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          {ex.slug && <Link href={`/oefeningen/${ex.slug}`} className="mt-2 inline-block text-sm font-bold text-accentdark hover:underline">Volledige uitleg →</Link>}

          {/* set logging */}
          <div className="mt-4 rounded-2xl border border-borderc p-3">
            <div className="mb-2 grid grid-cols-[2rem_1fr_1fr_2rem] items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand/40">
              <span>Set</span><span>Reps</span><span>Kg</span><span />
            </div>
            {rows.map((row, i) => (
              <div key={i} className="mb-2 grid grid-cols-[2rem_1fr_1fr_2rem] items-center gap-2">
                <span className="text-center font-black text-brand/50">{i + 1}</span>
                <input inputMode="numeric" value={row.reps} onChange={(e) => setRow(i, "reps", e.target.value)} className="rounded-xl border border-borderc px-3 py-2 text-center text-brand" />
                <input inputMode="decimal" placeholder="–" value={row.weight_kg} onChange={(e) => setRow(i, "weight_kg", e.target.value)} className="rounded-xl border border-borderc px-3 py-2 text-center text-brand" />
                <button onClick={() => delRow(i)} className="text-brand/30 hover:text-red-500" aria-label="Verwijder set">✕</button>
              </div>
            ))}
            <button onClick={addRow} className="mt-1 text-sm font-bold text-accentdark hover:underline">＋ set</button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={logSets} disabled={busy} className="flex-1 rounded-full bg-accent px-5 py-3 text-sm font-bold text-brand transition hover:opacity-90 disabled:opacity-50">{busy ? "Bezig…" : "Log sets"}</button>
            <button onClick={quickDone} className={"rounded-full px-5 py-3 text-sm font-bold transition " + (done ? "bg-brand text-white" : "border-2 border-borderc text-brand hover:border-accent")}>{done ? "✓ Klaar" : "Klaar"}</button>
            <button onClick={() => onRest(pe.rest_sec || 90)} className="rounded-full border-2 border-borderc px-5 py-3 text-sm font-bold text-brand transition hover:border-accent">⏱ {pe.rest_sec || 90}s</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RestPill({ rest, onClose }) {
  const [left, setLeft] = useState(rest.sec);
  useEffect(() => { setLeft(rest.sec); }, [rest]);
  useEffect(() => {
    if (left <= 0) { try { navigator.vibrate?.(200); } catch {} const t = setTimeout(onClose, 900); return () => clearTimeout(t); }
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [left, onClose]);
  const pct = rest.total ? (left / rest.total) * 100 : 0;
  return (
    <div className="fixed inset-x-0 bottom-24 z-40 mx-auto flex max-w-2xl justify-center px-5 md:bottom-6">
      <div className="flex w-full items-center gap-3 rounded-full bg-brand px-5 py-3 text-white shadow-xl shadow-brand/30">
        <span className="text-sm font-bold">Rust</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-accent transition-all duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-black tabular-nums">{left <= 0 ? "Go! 💪" : mmss(left)}</span>
        <button onClick={onClose} className="ml-1 text-white/60 hover:text-white" aria-label="Sluit timer">✕</button>
      </div>
    </div>
  );
}
