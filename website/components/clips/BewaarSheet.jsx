"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { leesClip } from "@/lib/clips";
import { bewaarClip } from "@/app/(site)/bewaard/actions";

// Bewaren in één scherm: link erin, naam, map, klaar.
//
// De link wordt hier al gelezen (lib/clips is puur, dus dat kan gewoon in de browser). Daardoor
// zie je meteen "Instagram herkend" in plaats van pas na het opslaan te ontdekken dat er iets
// mis was. De server leest hem nogmaals — die controle is de echte, deze is beleefdheid.

export default function BewaarSheet({ folders = [], sluit, na, initieelRuw = "", ingebed = false }) {
  const [ruw, setRuw] = useState(initieelRuw);
  const [titel, setTitel] = useState("");
  const [mapId, setMapId] = useState("");
  const [nieuweMapNaam, setNieuweMapNaam] = useState("");
  const [nieuw, setNieuw] = useState(false);
  const [fout, setFout] = useState(null);
  const [klaar, setKlaar] = useState(null);
  const [pending, start] = useTransition();
  const linkRef = useRef(null);

  const gelezen = ruw.trim() ? leesClip(ruw) : null;
  const geldig = !!gelezen?.ok;

  useEffect(() => { if (!initieelRuw) linkRef.current?.focus(); }, [initieelRuw]);

  // Escape sluit — maar niet op de eigen /bewaren-pagina, daar is er niets om naar terug te vallen.
  useEffect(() => {
    if (ingebed || !sluit) return;
    const op = (e) => { if (e.key === "Escape") sluit(); };
    window.addEventListener("keydown", op);
    return () => window.removeEventListener("keydown", op);
  }, [ingebed, sluit]);

  // Op iPhone bestaat er geen deelknop naar een webapp (Apple ondersteunt dat niet), dus daar is
  // kopiëren-plakken de weg. Deze knop scheelt het gefrunnik met de cursor in een tekstveld.
  const plak = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setRuw(t); setFout(null); }
      else setFout("Er staat niets op je klembord.");
    } catch {
      setFout("Plakken lukte niet — houd je vinger op het veld en kies “Plakken”.");
    }
  };

  const opslaan = () => start(async () => {
    setFout(null);
    const r = await bewaarClip({
      ruw,
      titel,
      mapId: nieuw ? "" : mapId,
      map: nieuw ? nieuweMapNaam : "",
    });
    if (r?.error) return setFout(r.error);
    setKlaar(r);
  });

  const opnieuw = () => {
    setRuw(""); setTitel(""); setKlaar(null); setFout(null);
    linkRef.current?.focus();
  };

  const body = klaar ? (
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-3xl">✓</div>
      <h2 className="mt-4 text-2xl font-black text-brand">{klaar.alBekend ? "Stond er al" : "Bewaard"}</h2>
      <p className="mt-2 text-ink-soft">
        <strong className="text-brand">{klaar.titel}</strong>{" "}
        {klaar.alBekend ? "had je al bewaard — je naam en map blijven staan." : "staat in je bibliotheek."}
      </p>
      <div className="mt-7 flex flex-col gap-3">
        <button type="button" onClick={opnieuw} className="rounded-full bg-accent px-6 py-3.5 font-black text-brand transition hover:opacity-90">
          Nog een bewaren
        </button>
        <a href="/bewaard" className="rounded-full border-2 border-borderc px-6 py-3.5 font-bold text-brand transition hover:border-lav">
          Naar mijn bibliotheek
        </a>
      </div>
    </div>
  ) : (
    <div className="mx-auto max-w-lg">
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Link</span>
        <textarea
          ref={linkRef}
          value={ruw}
          onChange={(e) => { setRuw(e.target.value); setFout(null); }}
          rows={3}
          placeholder="Plak hier de link van een reel, short of video"
          className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2.5 text-base text-brand outline-none transition placeholder:text-brand/30 focus:border-accent"
        />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={plak} className="rounded-full border-2 border-borderc px-4 py-2 text-sm font-bold text-ink-soft transition hover:border-lav hover:text-brand">
          Plak van klembord
        </button>
        {gelezen && (
          geldig
            ? <span className="text-sm font-bold text-accentdark">{gelezen.label} herkend ✓</span>
            : <span className="text-sm font-semibold text-red-600">{gelezen.reden}</span>
        )}
      </div>

      <label className="mt-6 block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Naam (mag je leeg laten)</span>
        <input
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          maxLength={120}
          placeholder="bv. Bulgarian split squat"
          className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2.5 text-base text-brand outline-none transition placeholder:text-brand/30 focus:border-accent"
        />
      </label>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
        Bij YouTube en TikTok halen we de titel zelf op. Instagram geeft die niet vrij — typ er dus
        best zelf iets bij, anders vind je hem later niet terug.
      </p>

      <div className="mt-6">
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-lav">Map</span>
        <div className="flex flex-wrap gap-2">
          <Keuze actief={!nieuw && !mapId} op={() => { setNieuw(false); setMapId(""); }} label="Zonder map" />
          {folders.map((f) => (
            <Keuze key={f.id} actief={!nieuw && mapId === f.id} op={() => { setNieuw(false); setMapId(f.id); }} label={f.name} />
          ))}
          <Keuze actief={nieuw} op={() => setNieuw(true)} label="+ Nieuwe map" />
        </div>
        {nieuw && (
          <input
            value={nieuweMapNaam}
            onChange={(e) => setNieuweMapNaam(e.target.value)}
            maxLength={40}
            autoFocus
            placeholder="bv. Leg day"
            className="mt-3 w-full rounded-xl border-2 border-borderc bg-white px-3 py-2.5 text-base text-brand outline-none transition placeholder:text-brand/30 focus:border-accent"
          />
        )}
      </div>

      {fout && <p className="mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}

      <button
        type="button"
        disabled={pending || !geldig}
        onClick={opslaan}
        className="mt-6 w-full rounded-full bg-accent py-4 text-lg font-black text-brand transition hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "Bezig…" : "Bewaren"}
      </button>
      <p className="mt-3 text-center text-xs leading-relaxed text-ink-soft">
        We bewaren de link, niet de video. Afspelen gebeurt bij de bron zelf.
      </p>
    </div>
  );

  if (ingebed) return body;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Video bewaren">
      <div className="flex items-center gap-3 border-b border-borderc px-4 py-3">
        <button type="button" onClick={sluit} aria-label="Sluiten" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-brand/50 transition hover:bg-paper hover:text-brand">✕</button>
        <p className="flex-1 font-black text-brand">Video bewaren</p>
        {klaar && <button type="button" onClick={na} className="shrink-0 text-sm font-bold text-accentdark">Klaar</button>}
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-7">{body}</div>
    </div>
  );
}

function Keuze({ actief, op, label }) {
  return (
    <button
      type="button"
      onClick={op}
      className={
        "rounded-full border-2 px-4 py-2 text-sm font-bold transition " +
        (actief ? "border-accent bg-accent/10 text-brand" : "border-borderc text-ink-soft hover:border-lav hover:text-brand")
      }
    >
      {label}
    </button>
  );
}
