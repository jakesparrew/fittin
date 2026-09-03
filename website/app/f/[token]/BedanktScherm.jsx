"use client";
import { useState, useTransition } from "react";
import { bewaarScore, zetFeedbackUit } from "./actions";

// Het bedankscherm na de sterrenvraag.
//
// DE REVIEWVRAAG IS VOOR IEDEREEN GELIJK. Geen `if (score >= 4)`, geen andere tekst, geen andere
// plek op het scherm. Google's beleid verbiedt woordelijk "selectief vragen om positieve reviews"
// (support.google.com/contributionpolicy/answer/7400114) en de sanctie loopt tot schorsing van het
// bedrijfsprofiel. Er staat ook nooit een beloning tegenover — dat is een aparte, even harde
// overtreding.
//
// Dat is bovendien niet de brave keuze maar de betere: uitgenodigde reviewers schrijven gematigder
// en representatiever dan wie uit zichzelf schrijft, want wie een middelmatige ervaring had vergeet
// het spontaan te doen.

const REVIEW_URL =
  process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL ||
  "https://www.google.com/maps/search/?api=1&query=Fittin+Aannemersstraat+186+9040+Gent";

export default function BedanktScherm({ token, score, opmerking }) {
  const [ster, setSter] = useState(score);
  const [tekst, setTekst] = useState(opmerking || "");
  const [bewaard, setBewaard] = useState(false);
  const [uit, setUit] = useState(false);
  const [pending, start] = useTransition();

  const kies = (n) => start(async () => {
    setSter(n);
    await bewaarScore(token, n, tekst);
  });

  const bewaarTekst = () => start(async () => {
    if (!ster) return;
    const r = await bewaarScore(token, ster, tekst);
    if (!r?.error) setBewaard(true);
  });

  if (uit) {
    return (
      <div className="mt-8 rounded-3xl border border-borderc bg-white p-8 text-center">
        <h1 className="text-2xl font-black text-brand">Geregeld</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Je krijgt na je sessies geen vraag meer. Je deurcodes en boekingsmails blijven gewoon komen.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="mt-4 text-2xl font-black text-brand">{ster ? "Bedankt!" : "Hoe was je sessie?"}</h1>

      <div className="mt-4 flex justify-center gap-1 rounded-2xl border border-borderc bg-white py-4">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => kies(n)}
            aria-label={`${n} van 5`}
            className={"px-1.5 text-4xl transition " + (ster && n <= ster ? "text-amber-500" : "text-borderc hover:text-amber-300")}
          >
            ★
          </button>
        ))}
      </div>

      {ster && (
        <>
          <label className="mt-5 block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Wil je er iets bij zeggen? (mag je overslaan)</span>
            <textarea
              value={tekst}
              onChange={(e) => { setTekst(e.target.value); setBewaard(false); }}
              rows={3}
              maxLength={1000}
              placeholder="Wat viel op, goed of slecht?"
              className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2.5 text-base text-brand outline-none transition placeholder:text-brand/30 focus:border-accent"
            />
          </label>
          <button
            type="button"
            disabled={pending || bewaard}
            onClick={bewaarTekst}
            className="mt-2 rounded-full border-2 border-borderc px-5 py-2 text-sm font-bold text-brand transition hover:border-lav disabled:opacity-50"
          >
            {bewaard ? "Bewaard ✓" : pending ? "Bezig…" : "Bewaren"}
          </button>

          {/* Identiek voor elke score. */}
          <div className="mt-8 rounded-2xl border border-borderc bg-white p-6 text-center">
            <p className="font-black text-brand">Help anderen ons vinden</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
              Een eerlijke review op Google — goed of slecht — helpt iemand die twijfelt meer dan
              eender welke advertentie die wij kunnen kopen.
            </p>
            <a
              href={REVIEW_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-full bg-accent px-6 py-3 font-black text-brand transition hover:opacity-90"
            >
              Schrijf een review op Google ↗
            </a>
          </div>

          <div className="mt-6 text-center">
            <a href="/account" className="text-sm font-bold text-brand hover:underline">Naar mijn account</a>
            <button
              type="button"
              onClick={() => start(async () => { const r = await zetFeedbackUit(token); if (!r?.error) setUit(true); })}
              className="mt-3 block w-full text-xs text-ink-soft hover:text-brand hover:underline"
            >
              Liever geen vraag meer na mijn sessie
            </button>
          </div>
        </>
      )}
    </>
  );
}
