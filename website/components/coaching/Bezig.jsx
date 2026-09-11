"use client";
import { useEffect, useState } from "react";

// Eén wachtindicator voor elke modelaanroep die het lid zelf start.
//
// WAAROM DIT BESTAAT. Een knop die "Je menu wordt samengesteld…" zegt en verder niets doet, is niet
// te onderscheiden van een knop die vastzit — en het weekmenu is met gemeten 3.855 uitvoertokens de
// tráágste aanroep van het hele systeem. Het lid stond dus het langst te wachten op de plek met de
// minste terugkoppeling.
//
// ONBEPAALD, en met opzet. De server stuurt geen voortgang terug: het is één fetch naar de gateway
// zonder tussenstappen. Alles wat op een percentage lijkt, zou hier verzonnen zijn. Wat wél waar is,
// is de verstreken tijd — die telt door zolang het duurt, en zegt het zelf wanneer het lang wordt.

export default function Bezig({ titel, uitleg, traagNa = 45 }) {
  const [seconden, setSeconden] = useState(0);

  // Pas ná de hydratatie. De klok tijdens het renderen lezen gaf in dit project hydratatiefout #418.
  useEffect(() => {
    const tik = setInterval(() => setSeconden((n) => n + 1), 1000);
    return () => clearInterval(tik);
  }, []);

  return (
    <div className="anim-in rounded-2xl bg-paper px-5 py-4 text-left">
      <p className="text-sm font-bold text-ink">{titel}</p>
      {uitleg && <p className="mt-1 text-xs leading-relaxed text-ink-soft">{uitleg}</p>}

      {/* Een lichtje dat heen en weer loopt, geen percentage. `shimmer` staat al in globals.css en
          valt stil onder reduced-motion via de universele regel daar. */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-borderc">
        <div className="h-full w-1/3 rounded-full bg-accent"
          style={{ animation: "shimmer 1.6s var(--ease-in-uit) infinite", transform: "translateX(-100%)" }} />
      </div>

      <p className="mt-2 text-xs text-ink/45">
        {seconden}s bezig
        {seconden >= traagNa && (
          <span className="ml-2 text-amber-700">— dit duurt langer dan gewoonlijk, maar er loopt nog iets.</span>
        )}
      </p>
    </div>
  );
}
