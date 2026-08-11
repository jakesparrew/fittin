"use client";
import { useEffect } from "react";

// Herstelt een bezoeker die vastloopt op een verdwenen stuk JavaScript.
//
// Wanneer gebeurt dat: bij elke nieuwe deploy krijgen de JS-bestanden een nieuwe naam met een
// inhoudshash. Wie de site al open had staan, heeft HTML in het geheugen die naar de OUDE namen
// verwijst. Klikt hij dan door naar een pagina waarvan het stuk nog geladen moet worden, dan bestaat
// dat bestand niet meer → ChunkLoadError, en de app doet niets meer. De bezoeker ziet een halve
// pagina en weet niet dat "gewoon herladen" het oplost.
//
// De oplossing is precies dat: één keer herladen. De verse HTML verwijst naar de nieuwe namen en
// alles werkt weer. Dit is dan ook géén verdoezelde bug — de code is in orde, de pagina is enkel
// verouderd.
//
// De rem: zonder geheugen zou een pagina die blijft falen zichzelf eindeloos herladen. Daarom
// onthouden we het moment van de vorige poging. Dat is strikt noodzakelijke opslag (het beschermt
// de bezoeker tegen een herlaadlus), dus toegestaan zonder toestemming — zie /cookies.
const SLEUTEL = "fittin_chunk_herstel";
const RUSTPERIODE_MS = 30000;

const isChunkFout = (tekst) => {
  const t = String(tekst || "").toLowerCase();
  return (
    t.includes("chunkloaderror") ||
    t.includes("loading chunk") ||
    t.includes("loading css chunk") ||
    // Moderne bundlers/browsers formuleren het via de dynamische import.
    t.includes("failed to fetch dynamically imported module") ||
    t.includes("error loading dynamically imported module") ||
    t.includes("importing a module script failed")
  );
};

export default function ChunkErrorRecovery() {
  useEffect(() => {
    const herstel = (reden) => {
      let vorige = 0;
      try { vorige = Number(sessionStorage.getItem(SLEUTEL) || 0); } catch { /* opslag geblokkeerd */ }
      // Al net herladen en tóch weer stuk? Dan lost herladen het niet op. Verder herladen zou de
      // bezoeker in een lus zetten die erger is dan de fout zelf; laat de foutpagina het overnemen.
      if (vorige && Date.now() - vorige < RUSTPERIODE_MS) return;
      try { sessionStorage.setItem(SLEUTEL, String(Date.now())); } catch { /* opslag geblokkeerd */ }

      // Melden vóór het herladen, anders verdwijnt het spoor. sendBeacon overleeft het navigeren.
      try {
        const body = JSON.stringify({
          message: `chunk-herstel: pagina automatisch herladen (${reden})`,
          path: location.pathname,
        });
        navigator.sendBeacon?.("/api/log-error", new Blob([body], { type: "application/json" }));
      } catch { /* melden mag nooit het herstel blokkeren */ }

      location.reload();
    };

    const opFout = (e) => { if (isChunkFout(e?.message)) herstel("error"); };
    const opAfwijzing = (e) => {
      const r = e?.reason;
      if (isChunkFout(r?.name) || isChunkFout(r?.message)) herstel("promise");
    };

    window.addEventListener("error", opFout);
    window.addEventListener("unhandledrejection", opAfwijzing);
    return () => {
      window.removeEventListener("error", opFout);
      window.removeEventListener("unhandledrejection", opAfwijzing);
    };
  }, []);

  return null;
}
