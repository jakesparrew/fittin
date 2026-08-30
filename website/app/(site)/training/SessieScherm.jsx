"use client";
import Link from "next/link";
import { useState } from "react";
import WorkoutPlayer from "./WorkoutPlayer";

// Het kale sessiescherm: vaste kopbalk met voortgang, de speler in focusstand, en een afsluitkaart
// zodra alles gelogd is. Geen chat, geen grafieken, geen andere dagen — alles wat hier staat, staat
// er omdat je het tijdens je set nodig hebt.
export default function SessieScherm({ dag, minuten, resultaat }) {
  const [stoppen, setStoppen] = useState(false);
  const totaal = dag.exercises.length;
  const klaar = dag.exercises.filter((pe) => pe.doneToday).length;
  const pct = totaal ? Math.round((klaar / totaal) * 100) : 0;
  const af = totaal > 0 && klaar === totaal;

  return (
    <main className="min-h-screen bg-paper">
      {/* Vaste kopbalk. `top-0` mag hier omdat het sessiescherm de onderbalk verbergt en er geen
          andere vaste balk in beeld staat. */}
      <header className="sticky top-0 z-40 border-b border-borderc bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setStoppen(true)}
            aria-label="Sessie stoppen"
            className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-brand/50 transition hover:bg-paper hover:text-brand"
          >
            ✕
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-black text-brand">{dag.name || `Dag ${dag.day_no}`}</p>
            <p className="text-xs text-ink-soft">± {minuten} min</p>
          </div>
          <span className="shrink-0 rounded-full bg-paper px-3 py-1 text-sm font-black tabular-nums text-brand">
            {klaar} / {totaal}
          </span>
        </div>
        <div className="h-1 bg-borderc">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pb-32 pt-5">
        {af && (
          <section className="mb-5 rounded-3xl bg-brand p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">Sessie afgewerkt</p>
            <h2 className="mt-1.5 text-2xl font-black">Goed gedaan 💪</h2>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Cijfer label="oefeningen" waarde={`${resultaat.oefeningen}/${resultaat.totaal}`} />
              <Cijfer label="sets" waarde={resultaat.sets} />
              <Cijfer label="kg getild" waarde={resultaat.volume.toLocaleString("nl-BE")} />
            </dl>
            {resultaat.prs > 0 && (
              <p className="mt-4 rounded-2xl bg-accent/15 px-4 py-2.5 text-center text-sm font-bold text-accent">
                🏆 {resultaat.prs} persoonlijk record{resultaat.prs === 1 ? "" : "en"} vandaag
              </p>
            )}
            <p className="mt-4 text-center text-sm text-lav">Je coach ziet dit meteen.</p>
            <Link href="/training" className="mt-4 block rounded-full bg-accent py-3.5 text-center font-black text-brand transition hover:opacity-90">
              Terug naar mijn training
            </Link>
          </section>
        )}

        <WorkoutPlayer days={[dag]} focus />
      </div>

      {stoppen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand/40 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6">
            <p className="text-lg font-black text-brand">Sessie stoppen?</p>
            <p className="mt-1.5 text-sm text-ink-soft">Je gelogde sets blijven bewaard — je kan later gewoon verder waar je gestopt bent.</p>
            <div className="mt-5 flex gap-2">
              <Link href="/training" className="flex-1 rounded-full bg-brand py-3 text-center font-bold text-white transition hover:opacity-90">Stoppen</Link>
              <button type="button" onClick={() => setStoppen(false)} className="flex-1 rounded-full border-2 border-borderc py-3 font-bold text-brand transition hover:border-lav">
                Verder trainen
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Cijfer({ label, waarde }) {
  return (
    <div className="rounded-2xl bg-white/10 px-2 py-3">
      <dd className="text-xl font-black tabular-nums">{waarde}</dd>
      <dt className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-lav">{label}</dt>
    </div>
  );
}
