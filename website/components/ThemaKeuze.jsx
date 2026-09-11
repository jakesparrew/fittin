"use client";
import { useEffect, useState } from "react";

// De themaschakelaar: systeem, licht, donker.
//
// Waarom LICHT de standaard is en niet "systeem": het merk is fel groen op wit, en de site is ook
// een etalage. Elke bezoeker met een donker toestel ongevraagd een donkere marketingpagina geven,
// is een productbeslissing en geen technische standaard. Wie het donker wil, kiest het hier — en
// "Systeem" blijft bestaan voor wie zijn toestel wél wil laten beslissen.
//
// Waarom de knoppen pas ná de hydratatie de actieve stand tonen: de keuze staat in localStorage en
// die bestaat op de server niet. Meteen renderen zou betekenen dat de server "systeem" tekent en de
// client een tel later "donker" — hydratatiefout #418, dezelfde als de klok tijdens het renderen.
// Het THEMA zelf staat al goed vóór de eerste verf; dat doet het scriptje in app/layout.jsx.

const STANDEN = [
  { v: "light", l: "Licht", u: "Het standaardthema" },
  { v: "dark", l: "Donker", u: "Altijd het donkere thema" },
  { v: "system", l: "Volg mijn toestel", u: "Donker zodra je telefoon of laptop dat is" },
];

export default function ThemaKeuze() {
  const [stand, setStand] = useState(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem("fittin-thema");
      setStand(["dark", "light", "system"].includes(t) ? t : "light");
    } catch { setStand("light"); }
  }, []);

  function kies(v) {
    setStand(v);
    try {
      // "light" is de standaard, dus die hoeft niet bewaard te worden — behalve als iemand
      // terugschakelt vanaf een andere keuze; dan moet de oude waarde weg.
      if (v === "light") localStorage.removeItem("fittin-thema");
      else localStorage.setItem("fittin-thema", v);
    } catch { /* privémodus: de keuze geldt dan alleen voor deze pagina */ }
    // Het attribuut STAAT er nu ook voor "system": de mediaquery hangt daaraan, zodat het volgen
    // van het toestel een keuze is en niet de afwezigheid van een keuze.
    if (v === "light") delete document.documentElement.dataset.theme;
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
