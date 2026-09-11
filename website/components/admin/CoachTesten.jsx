"use client";
import { useState, useTransition } from "react";
import { stuurTestCoachMails, stuurTestDeurcodeMail } from "@/app/beheer/coaching/actions";

// De testknoppen. Alles gaat naar het adres van de INGELOGDE beheerder — er is geen veld waar een
// ander adres in kan, want dat zou een knop zijn om namens de gym post te sturen.
//
// Ze kosten niets: de inhoud is verzonnen en staat in de serveractie, er komt geen model aan te pas
// en de dagrem wordt niet aangeraakt.

export default function CoachTesten({ email }) {
  const [bezig, start] = useTransition();
  const [melding, setMelding] = useState(null);
  const [welke, setWelke] = useState(null);

  function doe(naam, fn) {
    setMelding(null);
    setWelke(naam);
    start(async () => {
      const r = await fn();
      setMelding(r?.error ? { fout: r.error } : { ok: r?.ok || "Verstuurd ✓" });
      setWelke(null);
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-borderc bg-surface p-5">
      <h2 className="font-display text-lg font-black text-ink">Zelf uitproberen</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
        De zondagmail vertrekt pas als een week zes dagen loopt, en de deurcodemail hangt aan een
        echte boeking. Deze twee knoppen sturen dezelfde sjablonen met verzonnen cijfers naar{" "}
        <b className="text-ink">{email}</b> — geen modelaanroep, geen kosten, en er verandert niets
        aan het dossier van een lid.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={bezig} onClick={() => doe("week", stuurTestCoachMails)}
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">
          {bezig && welke === "week" ? "Bezig…" : "Stuur mij de drie zondagmails"}
        </button>
        <button type="button" disabled={bezig} onClick={() => doe("deur", stuurTestDeurcodeMail)}
          className="rounded-full border-2 border-borderc px-5 py-2.5 text-sm font-bold text-ink transition hover:border-accent disabled:opacity-50">
          {bezig && welke === "deur" ? "Bezig…" : "Stuur mij de deurcodemail met workout"}
        </button>
      </div>

      {melding && (
        <p className={"mt-3 rounded-xl px-4 py-3 text-sm font-bold " + (melding.fout ? "bg-red-50 text-red-700" : "bg-accent/10 text-ink")}>
          {melding.fout || melding.ok}
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-ink/40">
        Ze staan daarna in <b>Inbox → Automatisch</b> onder soort <code>coaching_test</code>. Wil je
        de intake zelf opnieuw doorlopen, stop dan je eigen plan via &ldquo;Je plan en je
        gegevens&rdquo; op /coaching — daarna staat de wizard er weer, met je antwoorden voorgevuld.
      </p>
    </section>
  );
}
