"use client";
import { useEffect, useState } from "react";

// De themaschakelaar: systeem, licht, donker.
//
// Waarom "systeem" de standaard is en niet "licht": wie zijn telefoon 's avonds op donker zet, doet
// dat voor alles. Een app die dan als enige wit blijft, is de app die je 's avonds niet opent.
//
// Waarom de knoppen pas ná de hydratatie de actieve stand tonen: de keuze staat in localStorage en
// die bestaat op de server niet. Meteen renderen zou betekenen dat de server "systeem" tekent en de
// client een tel later "donker" — hydratatiefout #418, dezelfde als de klok tijdens het renderen.
// Het THEMA zelf staat al goed vóór de eerste verf; dat doet het scriptje in app/layout.jsx.

const STANDEN = [
  { v: "system", l: "Systeem", u: "Volgt je telefoon of laptop" },
  { v: "light", l: "Licht", u: "Altijd het lichte thema" },
  { v: "dark", l: "Donker", u: "Altijd het donkere thema" },
];

export default function ThemaKeuze() {
  const [stand, setStand] = useState(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem("fittin-thema");
      setStand(t === "dark" || t === "light" ? t : "system");
    } catch { setStand("system"); }
  }, []);

  function kies(v) {
    setStand(v);
    try {
      if (v === "system") localStorage.removeItem("fittin-thema");
      else localStorage.setItem("fittin-thema", v);
    } catch { /* privémodus: de keuze geldt dan alleen voor deze pagina */ }
    // `delete` en niet `= "system"`: zonder het attribuut valt de CSS terug op
    // prefers-color-scheme, en dat is precies wat "systeem" betekent.
    if (v === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = v;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {STANDEN.map((s) => (
        <button key={s.v} type="button" onClick={() => kies(s.v)} title={s.u}
          aria-pressed={stand === s.v}
          className={"rounded-full px-4 py-2 text-sm font-bold transition " +
            (stand === s.v ? "bg-brand text-white" : "border-2 border-borderc text-ink/70 hover:border-accent")}>
          {s.l}
        </button>
      ))}
    </div>
  );
}
