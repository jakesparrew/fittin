"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";
import ExerciseDetail from "@/components/exercises/ExerciseDetail";
import {
  coachBewaarDag,
  coachZoekOefeningen,
  coachNieuweDag,
  coachDupliceerDag,
  coachVerwijderDagNieuw,
} from "@/app/coach/coaching-actions";

// De programmabouwer, herbouwd voor de telefoon.
//
// De oude bouwer was een verzameling losse formulieren: ~900 oefeningen als prop in een dropdown
// van 208px, één volledige serverrit per bewerking (een schema van 3×6 kostte ~118 taps en 20
// ritten), micro-knopjes van 10×16px als enige acties, en geen enkele manier om te herordenen.
//
// Nu: alles leeft in lokale staat, één "Opslaan" per dag schrijft de hele dag in één rit
// (coachBewaarDag), oefeningen kies je in een schermvullend blad met serverzoek en beeld, en elke
// rij heeft één duimgroot ⋯-menu met bewerken/dupliceren/omhoog/omlaag/verwijderen. Alle
// invoervelden staan op 16px — kleiner en iOS zoomt bij elke focus het scherm binnen.
//
// /beheer/programmas blijft bewust op de oude editor: dat is het laptopscherm van de eigenaar,
// niet het scherm waarmee coaches overtuigd moeten worden.

let uidTeller = 0;
const uid = () => `n${++uidTeller}`;

// Cijfers gaan als reps de databank in, al de rest ("8-12", "30 sec", "AMRAP") als rep_text.
const leesReps = (r) => (r.rep_text ? r.rep_text : r.reps ?? "");
const schrijfReps = (waarde) => {
  const s = String(waarde ?? "").trim();
  if (!s) return { reps: null, rep_text: null };
  return /^\d+$/.test(s) ? { reps: parseInt(s, 10), rep_text: null } : { reps: null, rep_text: s.slice(0, 40) };
};

const naarRij = (pe) => ({
  key: pe.id || uid(),
  id: pe.id || null,
  exercise_id: pe.exercises?.id || pe.exercise_id,
  exercise: pe.exercises || pe.exercise,
  sets: pe.sets ?? 3,
  repsInvoer: String(leesReps(pe) || 10),
  rest_sec: pe.rest_sec ?? 90,
  notes: pe.notes || "",
  tempo: pe.tempo || "",
  target_weight_kg: pe.target_weight_kg ?? "",
  rpe: pe.rpe ?? "",
  superset_group: pe.superset_group ?? "",
  section: pe.section || "",
});

export default function Bouwer({ program }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dagen, setDagen] = useState(() =>
    (program.days || []).map((d) => ({
      id: d.id, day_no: d.day_no, naam: d.name || `Dag ${d.day_no}`,
      rijen: (d.program_exercises || []).map(naarRij), verwijderd: [],
    }))
  );
  const [vuil, setVuil] = useState(() => new Set());
  const [fout, setFout] = useState(null);
  const [bewerk, setBewerk] = useState(null);   // { dagId, key }
  const [kiezer, setKiezer] = useState(null);   // dagId waarvoor het oefeningblad open staat
  const [detail, setDetail] = useState(null);   // exercise voor de popup

  const markeer = (dagId) => setVuil((v) => new Set(v).add(dagId));
  const wijzigDag = (dagId, fn) => { setDagen((ds) => ds.map((d) => (d.id === dagId ? fn(d) : d))); markeer(dagId); };
  const wijzigRij = (dagId, key, patch) =>
    wijzigDag(dagId, (d) => ({ ...d, rijen: d.rijen.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  const verplaats = (dagId, key, delta) =>
    wijzigDag(dagId, (d) => {
      const i = d.rijen.findIndex((r) => r.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.rijen.length) return d;
      const rijen = [...d.rijen];
      [rijen[i], rijen[j]] = [rijen[j], rijen[i]];
      return { ...d, rijen };
    });

  const dupliceerRij = (dagId, key) =>
    wijzigDag(dagId, (d) => {
      const i = d.rijen.findIndex((r) => r.key === key);
      if (i < 0) return d;
      const kopie = { ...d.rijen[i], key: uid(), id: null };
      return { ...d, rijen: [...d.rijen.slice(0, i + 1), kopie, ...d.rijen.slice(i + 1)] };
    });

  const verwijderRij = (dagId, key) =>
    wijzigDag(dagId, (d) => {
      const rij = d.rijen.find((r) => r.key === key);
      return {
        ...d,
        rijen: d.rijen.filter((r) => r.key !== key),
        verwijderd: rij?.id ? [...d.verwijderd, rij.id] : d.verwijderd,
      };
    });

  const voegToe = (dagId, oefeningen) => {
    wijzigDag(dagId, (d) => ({
      ...d,
      // Nieuwe rijen starten op 3 × 10 · 90s — de waarden die je meestal toch zou intikken.
      rijen: [...d.rijen, ...oefeningen.map((ex) => naarRij({ exercises: ex, sets: 3, reps: 10, rest_sec: 90 }))],
    }));
    setKiezer(null);
  };

  const bewaar = () => {
    setFout(null);
    start(async () => {
      for (const dagId of vuil) {
        const d = dagen.find((x) => x.id === dagId);
        if (!d) continue;
        const res = await coachBewaarDag({
          programId: program.id,
          dayId: d.id,
          naam: d.naam,
          rijen: d.rijen.map((r) => ({
            id: r.id, exercise_id: r.exercise_id, sets: r.sets, ...schrijfReps(r.repsInvoer),
            rest_sec: r.rest_sec, notes: r.notes, tempo: r.tempo, target_weight_kg: r.target_weight_kg,
            rpe: r.rpe, superset_group: r.superset_group, section: r.section,
          })),
          verwijderd: d.verwijderd,
        });
        if (res?.error) { setFout(res.error); return; }
      }
      setVuil(new Set());
      router.refresh();
    });
  };

  const dagActie = (fn) => start(async () => {
    const res = await fn();
    if (res?.error) setFout(res.error);
    else router.refresh();
  });

  // router.refresh() haalt de serverstand op; neem die over zodra er niets meer open staat om te
  // bewaren, zodat nieuwe rijen hun echte id krijgen (nodig om daarna te kunnen bijwerken).
  const initRef = useRef(program.days);
  useEffect(() => {
    if (initRef.current !== program.days && vuil.size === 0) {
      initRef.current = program.days;
      setDagen((program.days || []).map((d) => ({
        id: d.id, day_no: d.day_no, naam: d.name || `Dag ${d.day_no}`,
        rijen: (d.program_exercises || []).map(naarRij), verwijderd: [],
      })));
    }
  }, [program.days, vuil.size]);

  const dirty = vuil.size > 0;
  const bewerkte = bewerk && dagen.find((d) => d.id === bewerk.dagId)?.rijen.find((r) => r.key === bewerk.key);

  return (
    <div className="space-y-5">
      {dagen.map((dag) => (
        <section key={dag.id} className="rounded-3xl border border-borderc bg-white p-4 md:p-5">
          <div className="flex items-center gap-2">
            <input
              value={dag.naam}
              onChange={(e) => wijzigDag(dag.id, (d) => ({ ...d, naam: e.target.value }))}
              aria-label="Naam van de dag"
              className="w-full min-w-0 rounded-xl border-2 border-transparent px-2 py-1.5 text-base font-black text-brand outline-none transition hover:border-borderc focus:border-accent"
            />
            <button type="button" onClick={() => dagActie(() => coachDupliceerDag(program.id, dag.id))} className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-ink-soft transition hover:bg-paper hover:text-brand" title="Dag dupliceren">⧉</button>
            <button
              type="button"
              onClick={() => { if (confirm(`"${dag.naam}" en alle oefeningen erin verwijderen?`)) dagActie(() => coachVerwijderDagNieuw(program.id, dag.id)); }}
              className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-50 hover:text-red-600"
              title="Dag verwijderen"
            >✕</button>
          </div>

          <div className="mt-3 space-y-2">
            {dag.rijen.map((r) => {
              const sup = r.superset_group ? String.fromCharCode(64 + Number(r.superset_group)) : null;
              return (
                <div key={r.key} className="flex items-center gap-3 rounded-2xl bg-paper p-2.5">
                  {/* Tik op het beeld = popup met de uitvoering. */}
                  <button type="button" onClick={() => setDetail(r.exercise)} className="shrink-0" aria-label={`Bekijk ${r.exercise?.name}`}>
                    <ExerciseMedia exercise={r.exercise} thumb className="h-14 w-14" rounded="rounded-xl" />
                  </button>
                  <button type="button" onClick={() => setBewerk({ dagId: dag.id, key: r.key })} className="min-w-0 flex-1 text-left">
                    <p className="line-clamp-2 font-bold leading-snug text-brand">
                      {sup && <span className="mr-1.5 rounded bg-brand px-1.5 py-0.5 text-[10px] font-black text-white align-middle">{sup}</span>}
                      {r.exercise?.name}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {r.sets} × {r.repsInvoer || "–"} · {r.rest_sec}s rust
                      {r.target_weight_kg !== "" && r.target_weight_kg != null ? ` · ${r.target_weight_kg} kg` : ""}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBewerk({ dagId: dag.id, key: r.key })}
                    aria-label={`Opties voor ${r.exercise?.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-black text-brand/40 transition hover:bg-white hover:text-brand"
                  >⋯</button>
                </div>
              );
            })}
            {dag.rijen.length === 0 && <p className="rounded-2xl bg-paper p-4 text-sm text-ink-soft">Nog geen oefeningen op deze dag.</p>}
          </div>

          <button
            type="button"
            onClick={() => setKiezer(dag.id)}
            className="mt-3 w-full rounded-2xl border-2 border-dashed border-borderc py-3.5 font-bold text-accentdark transition hover:border-accent hover:bg-accent/5"
          >
            + Oefeningen toevoegen
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={() => dagActie(() => coachNieuweDag(program.id))}
        className="w-full rounded-3xl border-2 border-dashed border-borderc py-4 font-bold text-brand/60 transition hover:border-lav hover:text-brand"
      >
        + Dag toevoegen
      </button>

      {/* Sticky opslaanbalk — verschijnt zodra er iets te bewaren valt. bottom-20 blijft boven de
          mobiele onderbalk. */}
      {(dirty || fout) && (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-xl rounded-2xl bg-brand p-3 text-white shadow-xl shadow-brand/30 md:bottom-6">
          {fout && <p className="mb-2 rounded-xl bg-red-500/20 px-3 py-2 text-sm font-semibold text-red-100">{fout}</p>}
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm text-lav">{vuil.size} {vuil.size === 1 ? "dag" : "dagen"} gewijzigd</p>
            <button type="button" onClick={() => { setVuil(new Set()); setFout(null); router.refresh(); }} className="shrink-0 rounded-full px-3 py-2 text-sm font-bold text-lav transition hover:text-white">Ongedaan</button>
            <button type="button" disabled={pending} onClick={bewaar} className="shrink-0 rounded-full bg-accent px-6 py-2.5 font-black text-brand transition hover:opacity-90 disabled:opacity-50">
              {pending ? "Bezig…" : "Opslaan"}
            </button>
          </div>
        </div>
      )}

      {bewerkte && (
        <RijBlad
          rij={bewerkte}
          onWijzig={(patch) => wijzigRij(bewerk.dagId, bewerk.key, patch)}
          onDupliceer={() => { dupliceerRij(bewerk.dagId, bewerk.key); setBewerk(null); }}
          onOmhoog={() => verplaats(bewerk.dagId, bewerk.key, -1)}
          onOmlaag={() => verplaats(bewerk.dagId, bewerk.key, 1)}
          onVerwijder={() => { verwijderRij(bewerk.dagId, bewerk.key); setBewerk(null); }}
          onSluit={() => setBewerk(null)}
        />
      )}

      {kiezer && <OefeningBlad onKies={(oefs) => voegToe(kiezer, oefs)} onSluit={() => setKiezer(null)} />}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand/40 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-brand">{detail.name}</h2>
              <button type="button" onClick={() => setDetail(null)} aria-label="Sluiten" className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-brand/50 hover:bg-paper">✕</button>
            </div>
            <ExerciseDetail exercise={detail} compact />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Het bewerkblad van één rij ────────────────────────────────────────────────────────────────
function RijBlad({ rij, onWijzig, onDupliceer, onOmhoog, onOmlaag, onVerwijder, onSluit }) {
  const [meer, setMeer] = useState(!!(rij.tempo || rij.rpe || rij.notes || rij.superset_group || rij.section || rij.target_weight_kg));
  const invoer = "w-full rounded-xl border-2 border-borderc px-3 py-2.5 text-base text-brand outline-none transition focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand/40 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onSluit}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <ExerciseMedia exercise={rij.exercise} thumb className="h-12 w-12 shrink-0" rounded="rounded-xl" />
          <p className="min-w-0 flex-1 font-black leading-snug text-brand">{rij.exercise?.name}</p>
          <button type="button" onClick={onSluit} aria-label="Sluiten" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-brand/50 hover:bg-paper">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stepper label="Sets" waarde={rij.sets ?? 3} min={1} max={12} onChange={(v) => onWijzig({ sets: v })} />
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">Reps</span>
            {/* Ook tekst: "8-12", "30 sec", "AMRAP". Cijfers worden reps, tekst wordt rep_text. */}
            <input value={rij.repsInvoer} onChange={(e) => onWijzig({ repsInvoer: e.target.value })} placeholder="10 of 8-12" className={invoer} />
          </label>
          <Stepper label="Rust (seconden)" waarde={rij.rest_sec ?? 90} min={0} max={600} stap={15} onChange={(v) => onWijzig({ rest_sec: v })} />
        </div>

        <button type="button" onClick={() => setMeer((m) => !m)} className="mt-4 text-sm font-bold text-accentdark hover:underline">
          {meer ? "▾ Minder" : "▸ Meer (streefgewicht, tempo, RPE, superset, notitie)"}
        </button>

        {meer && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">Streefgewicht (kg)</span>
              <input inputMode="decimal" value={rij.target_weight_kg} onChange={(e) => onWijzig({ target_weight_kg: e.target.value })} placeholder="bv. 60" className={invoer} /></label>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">Tempo</span>
              <input value={rij.tempo} onChange={(e) => onWijzig({ tempo: e.target.value })} placeholder="3-1-2" className={invoer} /></label>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">RPE (1–10)</span>
              <input inputMode="numeric" value={rij.rpe} onChange={(e) => onWijzig({ rpe: e.target.value })} placeholder="8" className={invoer} /></label>
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">Superset-groep</span>
              <input inputMode="numeric" value={rij.superset_group} onChange={(e) => onWijzig({ superset_group: e.target.value })} placeholder="1 = A, 2 = B" className={invoer} /></label>
            <label className="col-span-2 block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">Blok</span>
              <input value={rij.section} onChange={(e) => onWijzig({ section: e.target.value })} placeholder="bv. Warming-up, Hoofdoefening" className={invoer} /></label>
            <label className="col-span-2 block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">Notitie voor je client</span>
              <input value={rij.notes} onChange={(e) => onWijzig({ notes: e.target.value })} placeholder="bv. strikt uitvoeren, laatste set tot falen" className={invoer} /></label>
          </div>
        )}

        <div className="mt-5 grid grid-cols-4 gap-2">
          <Knopje op={onOmhoog} label="Omhoog">↑</Knopje>
          <Knopje op={onOmlaag} label="Omlaag">↓</Knopje>
          <Knopje op={onDupliceer} label="Dupliceer">⧉</Knopje>
          <Knopje op={onVerwijder} label="Verwijder" gevaar>✕</Knopje>
        </div>

        <button type="button" onClick={onSluit} className="mt-4 w-full rounded-full bg-accent py-3.5 font-black text-brand transition hover:opacity-90">Klaar</button>
      </div>
    </div>
  );
}

function Stepper({ label, waarde, min, max, stap = 1, onChange }) {
  const zet = (v) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</span>
      <div className="flex items-stretch overflow-hidden rounded-xl border-2 border-borderc">
        <button type="button" onClick={() => zet((waarde || 0) - stap)} aria-label={`${label} lager`} className="w-10 shrink-0 bg-paper text-lg font-black text-brand transition hover:bg-borderc">−</button>
        <input
          inputMode="numeric"
          value={waarde}
          onChange={(e) => { const n = parseInt(e.target.value, 10); onChange(Number.isFinite(n) ? n : ""); }}
          onBlur={() => zet(parseInt(waarde, 10) || min)}
          aria-label={label}
          className="w-full min-w-0 border-0 py-2.5 text-center text-base font-bold text-brand outline-none"
        />
        <button type="button" onClick={() => zet((waarde || 0) + stap)} aria-label={`${label} hoger`} className="w-10 shrink-0 bg-paper text-lg font-black text-brand transition hover:bg-borderc">+</button>
      </div>
    </div>
  );
}

function Knopje({ op, label, gevaar = false, children }) {
  return (
    <button
      type="button"
      onClick={op}
      className={
        "flex h-12 flex-col items-center justify-center rounded-2xl border-2 text-sm font-black transition " +
        (gevaar ? "border-red-200 text-red-500 hover:bg-red-50" : "border-borderc text-brand hover:border-lav")
      }
    >
      <span aria-hidden>{children}</span>
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

// ── Het oefeningblad: schermvullend kiezen, met beeld en serverzoek ──────────────────────────
function OefeningBlad({ onKies, onSluit }) {
  const [zoek, setZoek] = useState("");
  const [rows, setRows] = useState([]);
  const [laden, setLaden] = useState(true);
  const [gekozen, setGekozen] = useState([]); // volledige oefening-objecten, in tikvolgorde
  const timer = useRef(null);

  useEffect(() => {
    setLaden(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await coachZoekOefeningen(zoek);
      setRows(res.rows || []);
      setLaden(false);
    }, zoek ? 250 : 0);
    return () => clearTimeout(timer.current);
  }, [zoek]);

  const toggle = (ex) =>
    setGekozen((g) => (g.some((x) => x.id === ex.id) ? g.filter((x) => x.id !== ex.id) : [...g, ex]));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Oefeningen kiezen">
      <div className="border-b border-borderc p-3">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek een oefening…"
            className="w-full rounded-full border-2 border-borderc px-4 py-2.5 text-base text-brand outline-none transition focus:border-accent"
          />
          <button type="button" onClick={onSluit} aria-label="Sluiten" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-brand/50 hover:bg-paper">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 pb-28">
        {laden && <p className="p-4 text-sm text-ink-soft">Zoeken…</p>}
        {!laden && rows.length === 0 && <p className="p-4 text-sm text-ink-soft">Niets gevonden voor “{zoek}”.</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {rows.map((ex) => {
            const aan = gekozen.some((x) => x.id === ex.id);
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => toggle(ex)}
                className={"rounded-2xl border-2 p-1.5 text-left transition " + (aan ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}
              >
                <div className="relative">
                  <ExerciseMedia exercise={ex} thumb className="aspect-square w-full" rounded="rounded-xl" />
                  {aan && <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-black text-brand">✓</span>}
                </div>
                <p className="mt-1 line-clamp-2 text-xs font-bold leading-tight text-brand">{ex.name}</p>
              </button>
            );
          })}
        </div>
      </div>

      {gekozen.length > 0 && (
        <div className="absolute inset-x-3 bottom-6">
          <button type="button" onClick={() => onKies(gekozen)} className="w-full rounded-full bg-accent py-4 text-lg font-black text-brand shadow-xl shadow-brand/20 transition hover:opacity-90">
            Voeg {gekozen.length} {gekozen.length === 1 ? "oefening" : "oefeningen"} toe
          </button>
        </div>
      )}
    </div>
  );
}
