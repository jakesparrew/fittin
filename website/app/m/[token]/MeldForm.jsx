"use client";
import { useRef, useState, useTransition } from "react";
import { CATEGORIEEN } from "@/lib/meldpunt";
import { meldViaToken } from "./actions";

// Twee tikken en klaar. De categorie is de hele melding; tekst en foto zijn optioneel.
//
// WAAROM GEEN VERPLICHT TEKSTVELD: het bestaande meldvak is één leeg tekstvak, en dat leverde in
// vijf maanden één melding op. "Toestel stuk" zonder verdere uitleg is oneindig veel meer waard
// dan een alinea die nooit getypt wordt.

export default function MeldForm({ token }) {
  const [cat, setCat] = useState(null);
  const [fout, setFout] = useState(null);
  const [klaar, setKlaar] = useState(false);
  const [fotoNaam, setFotoNaam] = useState(null);
  const [pending, start] = useTransition();
  const formRef = useRef(null);

  const gekozen = CATEGORIEEN.find((c) => c.v === cat);

  const verstuur = () => start(async () => {
    setFout(null);
    const fd = new FormData(formRef.current);
    fd.set("token", token);
    fd.set("category", cat || "");
    const r = await meldViaToken(fd);
    if (r?.error) return setFout(r.error);
    setKlaar(true);
  });

  if (klaar) {
    return (
      <div className="mt-8 rounded-3xl border border-borderc bg-white p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-3xl">✓</div>
        <h2 className="mt-4 text-2xl font-black text-brand">Bedankt</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Je melding staat bij de zaakvoerder. Je krijgt bericht zodra hij ernaar kijkt — en nog eens
          wanneer het opgelost is.
        </p>
        <a href="/account" className="mt-6 inline-flex rounded-full bg-accent px-6 py-3 font-black text-brand transition hover:opacity-90">Naar mijn account</a>
      </div>
    );
  }

  return (
    <form ref={formRef} className="mt-6">
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIEEN.map((c) => (
          <button
            key={c.v}
            type="button"
            onClick={() => { setCat(c.v); setFout(null); }}
            className={
              "flex min-h-[64px] items-center gap-2 rounded-2xl border-2 p-3 text-left text-sm font-bold transition " +
              (cat === c.v ? "border-accent bg-accent/10 text-brand" : "border-borderc bg-white text-ink-soft hover:border-lav")
            }
          >
            <span className="text-lg" aria-hidden>{c.emoji}</span>
            <span className="min-w-0">{c.l}</span>
          </button>
        ))}
      </div>

      {gekozen && (
        <>
          <label className="mt-5 block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Kort iets erbij (mag je overslaan)</span>
            <textarea
              name="message"
              rows={3}
              maxLength={2000}
              placeholder={gekozen.hint}
              /* 16px: onder die grootte zoomt iOS bij het focussen in en springt de pagina. */
              className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2.5 text-base text-brand outline-none transition placeholder:text-brand/30 focus:border-accent"
            />
          </label>

          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-borderc bg-white px-4 py-3 text-sm font-bold text-ink-soft transition hover:border-lav">
            <span className="text-lg" aria-hidden>📷</span>
            <span className="min-w-0 flex-1 truncate">{fotoNaam || "Foto toevoegen (optioneel)"}</span>
            <input
              type="file"
              name="photo"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setFotoNaam(e.target.files?.[0]?.name || null)}
            />
          </label>

          <p className="mt-4 text-xs leading-relaxed text-ink-soft">
            Dit leest alleen de zaakvoerder — je coach niet. Bij een noodgeval bel je altijd eerst 112
            en meld je het nadien.
          </p>

          {fout && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}

          <button
            type="button"
            disabled={pending}
            onClick={verstuur}
            className="mt-4 w-full rounded-full bg-accent py-4 text-lg font-black text-brand transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Bezig…" : "Versturen"}
          </button>
        </>
      )}
    </form>
  );
}
