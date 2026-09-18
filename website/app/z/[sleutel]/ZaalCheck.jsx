"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { STAAT, TAGS } from "@/lib/netheid";
import { bewaarZaalcheck, voegDetailsToe } from "./actions";

// Eén tik in de mail = de keuze staat vast. De pagina bevestigt ze meteen bij het openen, niet via de link zelf:
// een mailscanner die links vooraf opent, voert geen JavaScript uit en kan dus niet "netjes" invullen namens het lid.
// Opnieuw tikken corrigeert — er komt geen tweede check en geen tweede keer punten.

export default function ZaalCheck({ sleutel, vooraf, bestaand, heeftFoto }) {
  const [staat, setStaat] = useState(bestaand);
  const [punten, setPunten] = useState(0);
  const [fout, setFout] = useState(null);
  const [details, setDetails] = useState(null); // null | "open" | "klaar"
  const [fotoNaam, setFotoNaam] = useState(null);
  const [extraPunten, setExtraPunten] = useState(0);
  const [pending, start] = useTransition();
  const formRef = useRef(null);
  const fotoRef = useRef(null);
  const gedaan = useRef(false);

  const kies = (s) => start(async () => {
    setFout(null);
    const r = await bewaarZaalcheck(sleutel, s);
    if (r?.error) return setFout(r.error);
    setStaat(r.state);
    if (r.punten) setPunten(r.punten);
    if (r.state !== "netjes") setDetails("open");
  });

  // De keuze uit de mail meteen bewaren (enkel als er nog niets staat of iets anders gekozen werd).
  useEffect(() => {
    if (gedaan.current || !vooraf || vooraf === bestaand) return;
    gedaan.current = true;
    kies(vooraf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Een bestand dat vóór de hydratatie gekozen werd, mist zijn change-event: bij het mounten uitlezen.
  useEffect(() => { const f = fotoRef.current?.files?.[0]; if (f) setFotoNaam(f.name); }, [details]);

  const verstuurDetails = () => start(async () => {
    setFout(null);
    const fd = new FormData(formRef.current);
    fd.set("sleutel", sleutel);
    const r = await voegDetailsToe(fd);
    if (r?.error) return setFout(r.error);
    if (r.punten) setExtraPunten(r.punten);
    setDetails("klaar");
  });

  return (
    <div className="mt-6">
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(STAAT).map(([v, s]) => (
          <button
            key={v}
            type="button"
            disabled={pending}
            onClick={() => kies(v)}
            aria-pressed={staat === v}
            className={
              "flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-sm font-bold transition disabled:opacity-60 " +
              (staat === v ? "border-accent bg-accent/10 text-ink" : "border-borderc bg-surface text-ink-soft hover:border-lav")
            }
          >
            <span className="text-2xl" aria-hidden>{s.e}</span>
            {s.l}
          </button>
        ))}
      </div>

      {fout && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}

      {staat && (
        <div className="mt-5 rounded-2xl border border-borderc bg-surface p-5">
          <p className="font-black text-ink">
            Bedankt! {punten > 0 && <span className="ml-1 rounded-full bg-accent/15 px-2 py-0.5 text-sm text-accentdark">+{punten} punten</span>}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {staat === "netjes"
              ? "Fijn om te horen. Laat jij hem straks ook zo achter voor de volgende?"
              : "Dit komt enkel bij de zaakvoerder terecht — nooit bij andere leden."}
          </p>
        </div>
      )}

      {staat && staat !== "netjes" && details !== "klaar" && (
        <form ref={formRef} className="mt-4" onSubmit={(e) => { e.preventDefault(); verstuurDetails(); }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-lav">Wat precies? (mag je overslaan)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <label key={t.v} className="cursor-pointer">
                <input type="checkbox" name="tags" value={t.v} className="peer sr-only" />
                <span className="inline-block rounded-full border-2 border-borderc bg-surface px-3 py-1.5 text-xs font-bold text-ink-soft transition peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2">
                  {t.l}
                </span>
              </label>
            ))}
          </div>
          {staat === "stuk" && (
            <textarea name="uitleg" rows={2} maxLength={1000} placeholder="Welk toestel, en wat is er mis?"
              className="mt-3 w-full rounded-xl border-2 border-borderc bg-surface px-3 py-2.5 text-base text-ink outline-none transition placeholder:text-ink/30 focus:border-accent" />
          )}
          {!heeftFoto && (
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-borderc bg-surface px-4 py-3 text-sm font-bold text-ink-soft transition hover:border-lav">
              <span className="text-lg" aria-hidden>📷</span>
              <span className="min-w-0 flex-1 truncate">{fotoNaam || "Foto toevoegen (+2 punten) — geen mensen op de foto"}</span>
              <input ref={fotoRef} type="file" name="photo" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => setFotoNaam(e.target.files?.[0]?.name || null)} />
            </label>
          )}
          <button type="submit" disabled={pending} className="mt-4 w-full rounded-full bg-accent py-3.5 font-black text-brand transition hover:opacity-90 disabled:opacity-50">
            {pending ? "Bezig…" : "Versturen"}
          </button>
        </form>
      )}

      {details === "klaar" && (
        <p className="mt-4 rounded-2xl bg-accent/10 p-4 text-sm font-bold text-ink">
          Doorgegeven ✓ {extraPunten > 0 && <span className="text-accentdark">+{extraPunten} punten voor de foto</span>}
        </p>
      )}

      <a href="/account/punten" className="mt-8 block text-center text-sm font-bold text-accentdark hover:underline">Mijn punten bekijken →</a>
    </div>
  );
}
