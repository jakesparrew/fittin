"use client";
import { useState, useTransition } from "react";
import { zetPlanStatus, zetToestemming } from "@/app/(site)/coaching/actions";

// Twee dingen die het lid moet kunnen en die nergens stonden.
//
// 1. PAUZEREN EN STOPPEN. De zondagmail zegt letterlijk "wil je pauzeren, dan kan dat ook" — en er
//    was geen knop. Een belofte in een mail zonder knop in de app is erger dan geen belofte.
// 2. DE TOESTEMMING INTREKKEN. Het privacybeleid, de intake én deze pagina verwijzen alle drie naar
//    "je gegevens" om de toestemming voor gezondheidsgegevens weer uit te zetten. Zodra er een plan
//    liep, was de intakewizard weg en was er geen enkel scherm meer dat die kolom kon aanraken.
//    Dat is art. 7.3 AVG: intrekken moet even makkelijk zijn als geven.

export default function PlanBeheer({ status, toestemming }) {
  const [bezig, start] = useTransition();
  const [melding, setMelding] = useState(null);
  const [stoppen, setStoppen] = useState(false);

  function zet(naar) {
    setMelding(null);
    start(async () => {
      const fd = new FormData();
      fd.set("status", naar);
      const r = await zetPlanStatus(fd);
      setMelding(r?.error || r?.message || null);
      if (!r?.error) setStoppen(false);
    });
  }

  function toestemmingOm(aan) {
    setMelding(null);
    start(async () => {
      const fd = new FormData();
      fd.set("aan", aan ? "1" : "0");
      const r = await zetToestemming(fd);
      setMelding(r?.error || r?.message || null);
    });
  }

  const knop = "rounded-full border-2 border-borderc bg-surface px-4 py-2 text-xs font-bold text-ink transition hover:border-lav disabled:opacity-50";

  return (
    <details className="rounded-3xl border border-borderc bg-surface p-5">
      <summary className="cursor-pointer text-sm font-black text-ink">Je plan en je gegevens</summary>

      <div className="mt-4 border-t border-borderc pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Je plan</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          {status === "gepauzeerd"
            ? "Je plan staat op pauze. Er gaat niets meer open en je krijgt geen zondagmail tot je hervat."
            : "Even geen tijd? Zet je plan op pauze — het blijft staan waar het staat en je krijgt geen mails meer."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {status === "gepauzeerd" ? (
            <button type="button" disabled={bezig} onClick={() => zet("lopend")}
              className="rounded-full bg-accent px-5 py-2 text-xs font-bold text-brand transition hover:opacity-90 disabled:opacity-50">
              Mijn plan hervatten
            </button>
          ) : (
            <button type="button" disabled={bezig} onClick={() => zet("gepauzeerd")} className={knop}>
              Pauzeren
            </button>
          )}
          {!stoppen ? (
            <button type="button" disabled={bezig} onClick={() => setStoppen(true)} className={knop}>
              Stoppen
            </button>
          ) : (
            <span className="anim-in flex flex-wrap items-center gap-2 rounded-2xl bg-paper px-3 py-2">
              <span className="text-xs text-ink/70">Stoppen kan niet ongedaan gemaakt worden.</span>
              <button type="button" disabled={bezig} onClick={() => zet("gestopt")}
                className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50">
                Ja, stop mijn plan
              </button>
              <button type="button" disabled={bezig} onClick={() => setStoppen(false)}
                className="text-xs font-bold text-ink/50 underline transition hover:text-ink">
                Toch niet
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-borderc pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Je lichaamsgegevens</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          {toestemming
            ? "Je coach mag je leeftijd, gewicht, lengte en wat je wil vermijden gebruiken om je schema af te stemmen. Je kan dat hier intrekken — dan werkt je coach verder zonder die informatie, en maakt hij geen weekmenu meer."
            : "Je coach werkt nu zonder je lichaamsgegevens. Zet je ze aan, dan kan hij je schema echt op jou afstemmen en een weekmenu maken."}
        </p>
        <button type="button" disabled={bezig} onClick={() => toestemmingOm(!toestemming)}
          className={"mt-3 " + knop}>
          {toestemming ? "Toestemming intrekken" : "Toestemming geven"}
        </button>
      </div>

      {melding && <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm font-bold text-ink">{melding}</p>}
    </details>
  );
}
