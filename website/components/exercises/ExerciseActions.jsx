"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toggleFavorite, addExerciseToPlan, logLooseSets } from "@/app/(site)/oefeningen/loop-actions";

// Het actiepaneel dat van een oefeningpagina een handeling maakt in plaats van een doodlopend
// artikel. Drie dingen, in de volgorde waarin ze in het echt gebeuren: bewaren voor later,
// in je schema zetten, of nú doen en loggen.
//
// Niet ingelogd: geen dode knoppen maar één eerlijke uitnodiging. Een knop die "log eerst in"
// roept nadat je hem indrukte, is een val.
const toast = (type, msg) => {
  try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {}
};

export default function ExerciseActions({ exerciseId, exerciseName }) {
  // De pagina zelf is statisch gecachet voor SEO, dus persoonlijke context komt hier los binnen.
  // `ctx === null` = nog niet geladen: dan tonen we niets in plaats van te gokken, anders flitst
  // "log in" even voorbij bij wie wél is ingelogd.
  const [ctx, setCtx] = useState(null);
  const [fav, setFav] = useState(false);
  const [open, setOpen] = useState(null); // 'plan' | 'log' | null
  const [pending, start] = useTransition();

  useEffect(() => {
    let levend = true;
    fetch(`/api/me/exercise-context?exerciseId=${encodeURIComponent(exerciseId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (levend) { setCtx(d); setFav(!!d.favoriet); } })
      .catch(() => { if (levend) setCtx({ ingelogd: false }); });
    return () => { levend = false; };
  }, [exerciseId]);

  if (ctx === null) return <div className="mt-5 h-12 animate-pulse rounded-2xl bg-paper" aria-hidden />;

  if (!ctx.ingelogd) {
    return (
      <div className="mt-5 rounded-2xl border-2 border-dashed border-borderc bg-paper/60 p-4 text-center">
        <p className="text-sm font-bold text-brand">Bewaar deze oefening of log je sets</p>
        <p className="mt-1 text-xs text-brand/55">Met een gratis account hou je je favorieten en je voortgang bij.</p>
        <Link href="/login" className="mt-3 inline-block rounded-full bg-accent px-5 py-2 text-sm font-black text-brand transition hover:opacity-90">Inloggen of account maken →</Link>
      </div>
    );
  }

  const doeFavoriet = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("exerciseId", exerciseId);
      const r = await toggleFavorite(fd);
      if (r?.error) return toast("error", r.error);
      setFav(!!r.favoriet);
      toast("success", r.message);
    });

  return (
    <div className="mt-5 border-t border-borderc pt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={doeFavoriet}
          disabled={pending}
          aria-pressed={fav}
          className={"rounded-full border-2 px-4 py-2 text-sm font-bold transition disabled:opacity-50 " + (fav ? "border-accent bg-accent/10 text-accentdark" : "border-borderc text-brand hover:border-accent")}
        >
          {fav ? "❤ Bewaard" : "♡ Bewaar"}
        </button>
        <button type="button" onClick={() => setOpen(open === "plan" ? null : "plan")} className="rounded-full border-2 border-borderc px-4 py-2 text-sm font-bold text-brand transition hover:border-accent">
          ＋ In mijn schema
        </button>
        <button type="button" onClick={() => setOpen(open === "log" ? null : "log")} className="rounded-full bg-accent px-4 py-2 text-sm font-black text-brand transition hover:opacity-90">
          ▶ Doe nu &amp; log
        </button>
      </div>

      {open === "plan" && <PlanKiezer exerciseId={exerciseId} dagen={ctx.dagen || []} onKlaar={() => setOpen(null)} />}
      {open === "log" && <LosLoggen exerciseId={exerciseId} exerciseName={exerciseName} onKlaar={() => setOpen(null)} />}
    </div>
  );
}

function PlanKiezer({ exerciseId, dagen, onKlaar }) {
  const [pending, start] = useTransition();
  const voeg = (dayId) =>
    start(async () => {
      const fd = new FormData();
      fd.set("exerciseId", exerciseId);
      if (dayId) fd.set("dayId", dayId);
      const r = await addExerciseToPlan(fd);
      if (r?.error) return toast("error", r.error);
      toast("success", r.message);
      onKlaar();
    });

  return (
    <div className="mt-3 rounded-2xl bg-paper p-4">
      {dagen.length === 0 ? (
        <>
          <p className="text-sm text-brand/70">Je hebt nog geen schema. We maken er meteen één voor je aan.</p>
          <button onClick={() => voeg(null)} disabled={pending} className="mt-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {pending ? "Bezig…" : "Maak schema + voeg toe"}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-lav">Aan welke dag?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {dagen.map((d) => (
              <button key={d.id} onClick={() => voeg(d.id)} disabled={pending} className="rounded-full border-2 border-borderc bg-white px-4 py-2 text-sm font-bold text-brand transition hover:border-accent disabled:opacity-50">
                {d.planNaam} · {d.naam}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Dezelfde set-tabel als in de workout-speler, maar los van een schema. Reden: /training leeft van
// workout_logs, en tot nu kon alleen wie een schema volgde iets loggen. Wie gewoon een oefening
// doet die hij hier vond, zag zijn voortgang dus nooit groeien.
function LosLoggen({ exerciseId, exerciseName, onKlaar }) {
  const [rows, setRows] = useState([{ reps: "", weight_kg: "" }]);
  const [pending, start] = useTransition();
  const zet = (i, veld, waarde) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [veld]: waarde } : x)));

  const log = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("exerciseId", exerciseId);
      fd.set("sets", JSON.stringify(rows));
      const r = await logLooseSets(fd);
      if (r?.error) return toast("error", r.error);
      toast("success", r.message);
      onKlaar();
    });

  return (
    <div className="mt-3 rounded-2xl bg-paper p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-lav">{exerciseName}</p>
      {/* minmax(0,1fr): een 1fr-kolom krimpt niet onder de eigen breedte van een invoerveld en
          duwt op een telefoon de laatste kolom buiten beeld — precies de bug van 16 augustus. */}
      <div className="mt-2 grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-brand/40">
        <span>Set</span><span>Reps</span><span>Kg</span><span />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="mt-2 grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
          <span className="text-center font-black text-brand/50">{i + 1}</span>
          <input inputMode="numeric" value={row.reps} onChange={(e) => zet(i, "reps", e.target.value)} placeholder="reps" className="w-full min-w-0 rounded-xl border border-borderc px-2 py-2 text-center text-brand" />
          <input inputMode="decimal" value={row.weight_kg} onChange={(e) => zet(i, "weight_kg", e.target.value)} placeholder="–" className="w-full min-w-0 rounded-xl border border-borderc px-2 py-2 text-center text-brand" />
          {rows.length > 1
            ? <button onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label={`Verwijder set ${i + 1}`} className="rounded-lg py-2 text-lg leading-none text-brand/30 transition hover:text-red-500">✕</button>
            : <span />}
        </div>
      ))}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setRows((r) => [...r, { reps: "", weight_kg: "" }])} className="text-sm font-bold text-accentdark hover:underline">＋ set</button>
        <button onClick={log} disabled={pending} className="ml-auto rounded-full bg-accent px-5 py-2 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-50">
          {pending ? "Bezig…" : "Log sets"}
        </button>
      </div>
    </div>
  );
}
