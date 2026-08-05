"use client";
import { useState } from "react";

// Verplichte akkoordverklaring vóór een aankoop op afstand (beurtenkaart of abonnement).
//
// Twee afzonderlijke vinkjes, bewust niet samengevoegd tot één:
//  1. akkoord met de voorwaarden en het privacybeleid;
//  2. het uitdrukkelijke verzoek om meteen te kunnen starten, mét de erkenning wat dat betekent
//     voor het herroepingsrecht (art. VI.53, 1° WER).
// De wet vraagt voor dat tweede een aparte, actieve handeling — het meeliften op een algemeen
// "ik ga akkoord" is precies wat een rechter niet aanvaardt. Vooraf aanvinken mag evenmin, dus
// beide starten leeg en de knop blijft uit tot ze allebei aan staan.
export default function LegalConsent({ label }) {
  const [terms, setTerms] = useState(false);
  const [start, setStart] = useState(false);
  const ready = terms && start;

  return (
    <div className="mt-4 space-y-2.5 text-left">
      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-brand/70">
        <input
          type="checkbox"
          name="acceptTerms"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#33B24A]"
        />
        <span>
          Ik ga akkoord met de{" "}
          <a href="/voorwaarden" target="_blank" rel="noopener noreferrer" className="font-bold text-accentdark underline">algemene voorwaarden</a>{" "}
          en het{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-bold text-accentdark underline">privacybeleid</a>.
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-brand/70">
        <input
          type="checkbox"
          name="acceptImmediate"
          checked={start}
          onChange={(e) => setStart(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#33B24A]"
        />
        <span>
          Ik vraag uitdrukkelijk om meteen te kunnen boeken, en ik weet dat ik mijn herroepingsrecht
          van 14 dagen verlies zodra alles opgebruikt is. Gebruik ik nog niet alles, dan krijg ik bij
          herroeping het ongebruikte deel terug.
        </span>
      </label>

      <button
        disabled={!ready}
        className="mt-1 w-full rounded-full bg-accent py-3 font-bold text-brand transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
      </button>
      {!ready && (
        <p className="text-center text-[11px] text-brand/40">Vink beide vakjes aan om verder te gaan.</p>
      )}
    </div>
  );
}
