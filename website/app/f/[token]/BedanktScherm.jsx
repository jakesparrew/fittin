"use client";
import { useState, useTransition } from "react";
import { bewaarScore, zetFeedbackUit, bewaarEnergie, verklaarNetjes, googleReviewGeklikt } from "./actions";

const ENERGIE = [
  { n: 1, e: "😫", l: "Zwaar" },
  { n: 2, e: "😐", l: "Matig" },
  { n: 3, e: "🙂", l: "Goed" },
  { n: 4, e: "💪", l: "Sterk" },
];

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
  // Rechtstreeks het venster "review schrijven" van het bedrijfsprofiel (place-id doorgegeven door de eigenaar, 19-09-2026).
  "https://search.google.com/local/writereview?placeid=ChIJKc6ttft3w0cRl--XdxjNKD0";

export default function BedanktScherm({ token, score, opmerking, alGevraagd = false }) {
  const [ster, setSter] = useState(score);
  const [tekst, setTekst] = useState(opmerking || "");
  const [bewaard, setBewaard] = useState(false);
  const [uit, setUit] = useState(false);
  const [energie, setEnergie] = useState(null);
  const [netjes, setNetjes] = useState(false);
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
      <div className="mt-8 rounded-3xl border border-borderc bg-surface p-8 text-center">
        <h1 className="text-2xl font-black text-ink">Geregeld</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Je krijgt na je sessies geen vraag meer. Je deurcodes en boekingsmails blijven gewoon komen.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="mt-4 text-2xl font-black text-ink">{ster ? "Bedankt!" : "Hoe was je sessie?"}</h1>
      {ster && <p className="mt-1 text-sm font-bold text-accentdark">+2 punten voor je beoordeling</p>}

      <div className="mt-4 flex justify-center gap-1 rounded-2xl border border-borderc bg-surface py-4">
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
              className="w-full rounded-xl border-2 border-borderc bg-surface px-3 py-2.5 text-base text-ink outline-none transition placeholder:text-ink/30 focus:border-accent"
            />
          </label>
          <button
            type="button"
            disabled={pending || bewaard}
            onClick={bewaarTekst}
            className="mt-2 rounded-full border-2 border-borderc px-5 py-2 text-sm font-bold text-ink transition hover:border-lav disabled:opacity-50"
          >
            {bewaard ? "Bewaard ✓" : pending ? "Bezig…" : "Bewaren"}
          </button>

          <div className="mt-6 rounded-2xl border border-borderc bg-surface p-5">
            <p className="text-sm font-black text-ink">Hoe voelde je training?</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {ENERGIE.map((x) => (
                <button key={x.n} type="button" disabled={pending}
                  onClick={() => start(async () => { const r = await bewaarEnergie(token, x.n); if (!r?.error) setEnergie(x.n); })}
                  aria-pressed={energie === x.n}
                  className={"flex flex-col items-center rounded-xl border-2 py-2 text-xs font-bold transition " + (energie === x.n ? "border-accent bg-accent/10 text-ink" : "border-borderc text-ink-soft hover:border-lav")}>
                  <span className="text-2xl" aria-hidden>{x.e}</span>{x.l}
                </button>
              ))}
            </div>
          </div>

          <button type="button" disabled={pending || netjes}
            onClick={() => start(async () => { const r = await verklaarNetjes(token); if (!r?.error) setNetjes(true); })}
            className={"mt-3 w-full rounded-2xl border-2 px-4 py-3 text-sm font-bold transition " + (netjes ? "border-accent bg-accent/10 text-ink" : "border-borderc bg-surface text-ink hover:border-lav")}>
            {netjes ? "✅ Top — de volgende vindt het netjes (+1 punt)" : "✅ Ik heb alles teruggelegd en afgeveegd"}
          </button>

          {/* Identiek voor elke score. Wie al eens naar Google doorklikte, krijgt de vraag niet opnieuw (0167). */}
          {!alGevraagd && <div className="mt-8 rounded-2xl border border-borderc bg-surface p-6 text-center">
            <p className="font-black text-ink">Help anderen ons vinden</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
              Een eerlijke review op Google — goed of slecht — helpt iemand die twijfelt meer dan
              eender welke advertentie die wij kunnen kopen.
            </p>
            <a
              href={REVIEW_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => { googleReviewGeklikt(token); }}
              className="mt-4 inline-flex rounded-full bg-accent px-6 py-3 font-black text-brand transition hover:opacity-90"
            >
              Schrijf een review op Google ↗
            </a>
          </div>}

          <div className="mt-6 text-center">
            <a href="/account" className="text-sm font-bold text-ink hover:underline">Naar mijn account</a>
            <button
              type="button"
              onClick={() => start(async () => { const r = await zetFeedbackUit(token); if (!r?.error) setUit(true); })}
              className="mt-3 block w-full text-xs text-ink-soft hover:text-ink hover:underline"
            >
              Liever geen vraag meer na mijn sessie
            </button>
          </div>
        </>
      )}
    </>
  );
}
