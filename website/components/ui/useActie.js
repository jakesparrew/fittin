"use client";
import { useActionState, useEffect, useRef } from "react";

// Eén manier om een beheeractie uit te voeren en te tonen wat er gebeurde.
//
// WAAROM EEN HOOK EN NIET ENKEL ActionForm. Een tiental beheerschermen (de wizards, de inbox, de
// campagneknoppen) bouwen hun eigen formulier met `useActionState`. Elk deed het anders: de ene
// toonde een vaste zin "Opgeslagen ✓" wat er ook terugkwam, de andere toonde niets, en geen enkele
// ving een actie op die GOOIT — dan kreeg de beheerder de foutpagina "Oeps" en wist hij niet of het
// gelukt was. Nu doen ze allemaal hetzelfde, en ActionForm leunt op precies deze hook.
//
// Wat er gebeurt:
//   - `{ error }`   → rode melding in de hoek, 10 seconden (ToastHost), en `state.error` voor inline.
//   - `{ message }` → bevestiging in de hoek met de zin die de actie zelf schreef.
//   - gooit         → dezelfde rode melding, met een eerlijke zin. `redirect()` gaat gewoon door.

export const SERVERFOUT = "Er liep iets mis op de server — niets bevestigd. Probeer opnieuw; blijft het falen, kijk dan bij Meldingen.";

export const meld = (type, msg) => {
  try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch { /* geen venster */ }
};

/** Is dit de gooi waarmee Next een redirect of notFound doorgeeft? Die mag nooit opgevangen worden. */
export const isNextNavigatie = (e) => {
  const d = String(e?.digest || e?.message || "");
  return d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_NOT_FOUND") || d.startsWith("NEXT_HTTP_ERROR");
};

/**
 * @param {(fd: FormData) => Promise<any>} actie
 * @param {{ success?: string, stil?: boolean }} opties  `stil`: geen toast bij succes (het scherm toont het zelf al groot)
 */
export function useActie(actie, { success = "Opgeslagen ✓", stil = false } = {}) {
  const [state, formAction, pending] = useActionState(async (_vorige, fd) => {
    try {
      return (await actie(fd)) || { ok: true };
    } catch (e) {
      if (isNextNavigatie(e)) throw e;
      return { error: SERVERFOUT };
    }
  }, null);

  const gezien = useRef(null);
  useEffect(() => {
    if (!state || state === gezien.current) return;
    gezien.current = state;
    if (state.error) meld("error", state.error);
    else if (!stil) meld("success", state.message || success);
  }, [state, success, stil]);

  return [state, formAction, pending];
}
