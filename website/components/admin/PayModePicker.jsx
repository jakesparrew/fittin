"use client";
import { useId, useState } from "react";

// Hoe wordt deze beheer-boeking betaald? Dit was één vinkje "Trek 1 sessie af" dat standaard UIT
// stond — vergeten = de sessie was gratis (±9 keer gebeurd, ±€ 96 nooit gefactureerd). En had het
// lid geen tegoed, dan wás gratis de enige uitweg. Nu: afboeken is de standaard, "gratis" een
// bewuste keuze mét reden, en er is een derde weg — laten betalen aan de balie.
const REDENEN = [
  "Compensatie (klacht of panne)",
  "Proefsessie / kennismaking",
  "Personeel of vriendendienst",
  "Actie of wedstrijd",
];

export default function PayModePicker({ className = "" }) {
  const [mode, setMode] = useState("credit");
  const listId = useId();
  return (
    <div className={"w-full " + className}>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Betaalwijze</span>
      <input type="hidden" name="payMode" value={mode} />
      <div className="inline-flex flex-wrap rounded-full border border-borderc bg-white p-1 text-xs font-bold">
        {[["credit", "🎟 Van tegoed"], ["charge", "💳 Te betalen"], ["gratis", "🎁 Gratis"]].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={"rounded-full px-3 py-1.5 transition " + (mode === k ? (k === "gratis" ? "bg-amber-500 text-white" : "bg-brand text-white") : "text-brand/60 hover:text-brand")}
          >
            {l}
          </button>
        ))}
      </div>
      {mode === "credit" && (
        <p className="mt-1 text-[11px] text-brand/45">Wordt van het tegoed van het lid afgetrokken (90 min = 1,5 beurt).</p>
      )}
      {mode === "charge" && (
        <p className="mt-1 text-[11px] text-brand/45">Komt bij <b>Onbetaald</b> te staan — vink “✓ cash” aan zodra het geld binnen is.</p>
      )}
      {mode === "gratis" && (
        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] font-bold text-amber-700">Deze sessie wordt gratis weggegeven — er gaat niets van het tegoed af en er komt geen betaling.</p>
          <input
            name="compReason"
            list={listId}
            required
            placeholder="Reden (verplicht) — bv. compensatie voor de deurcode"
            className="mt-2 w-full rounded-lg border-2 border-amber-300 bg-white px-3 py-1.5 text-sm"
          />
          <datalist id={listId}>
            {REDENEN.map((r) => <option key={r} value={r} />)}
          </datalist>
          <p className="mt-1 text-[10px] text-amber-700/70">De reden verschijnt bij de boeking én in Financiën, zodat je later ziet wat je hebt weggegeven.</p>
        </div>
      )}
    </div>
  );
}
