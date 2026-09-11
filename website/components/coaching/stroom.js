"use client";
import { useCallback, useState } from "react";

// Meelezen met /api/coaching/stroom.
//
// Het belangrijkste hier is wat er gebeurt als het MISLUKT te lezen. De server werkt door — dat is
// de hele opzet van `after()` in de route. Een verbroken verbinding is dus géén mislukte opdracht,
// en zo hoort het scherm het ook te zeggen. Vroeger was elke onderbreking een doodlopend einde;
// nu is het hoogstens een venster dat even niet meekijkt.

const LEEG = { stap: null, concept: null, seconden: 0 };

export function useStroom() {
  const [stand, setStand] = useState(LEEG);
  const [bezig, setBezig] = useState(false);

  /**
   * Start de opdracht en leest mee.
   * @returns {{ok:true, message:string} | {error:string} | {losgekoppeld:true}}
   */
  const start = useCallback(async (body) => {
    setBezig(true);
    setStand(LEEG);
    let uitkomst = null;
    // Is de opdracht op de server AANGEKOMEN? Dat is het verschil tussen "er wordt gewerkt, je mag
    // wegklikken" en "er is niets gestart". Zonder dit onderscheid zou een mislukte fetch hetzelfde
    // geruststellende scherm geven als een weggevallen verbinding — en dat is dan een leugen.
    let begonnen = false;

    try {
      const res = await fetch("/api/coaching/stroom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        setBezig(false);
        return { error: "Je hebt geen toegang tot de AI-coach." };
      }
      if (!res.ok || !res.body) {
        setBezig(false);
        return { error: `Je coach was niet bereikbaar (${res.status}). Probeer het zo dadelijk opnieuw.` };
      }
      begonnen = true;

      const lezer = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await lezer.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const regels = buffer.split("\n");
        buffer = regels.pop(); // de laatste regel kan half zijn
        for (const regel of regels) {
          if (!regel.startsWith("data:")) continue;
          let g;
          try { g = JSON.parse(regel.slice(5)); } catch { continue; }
          if (g.t === "stap") setStand((s) => ({ ...s, stap: g }));
          else if (g.t === "concept") setStand((s) => ({ ...s, concept: g }));
          else if (g.t === "fout") uitkomst = { error: g.tekst };
          else if (g.t === "klaar") uitkomst = { ok: true, message: g.tekst };
        }
      }
    } catch {
      // Valt hieronder samen met "de stroom stopte zonder eindbericht": in beide gevallen weten we
      // niet hoe het afliep, en in beide gevallen loopt het werk op de server door.
    }

    setBezig(false);
    if (uitkomst) return uitkomst;
    // Geen eindbericht gezien. Kwam de opdracht aan, dan wordt er nog gewerkt en mag het scherm
    // dicht; kwam ze nooit aan, dan is er niets onderweg en hoort dat er ook te staan.
    return begonnen
      ? { losgekoppeld: true }
      : { error: "Je coach was niet bereikbaar. Controleer je verbinding en probeer opnieuw." };
  }, []);

  return { start, bezig, ...stand };
}
