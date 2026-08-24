"use client";
import { useActionState, useState } from "react";
import { replyProblemReport } from "@/app/beheer/actions";

// Antwoorden op een probleemmelding, zonder de beheerpagina te verlaten.
//
// Hier stond een `mailto:`-link. Die opent niets wanneer er geen standaard mailprogramma is
// ingesteld — precies het geval bij wie Gmail in een tabblad gebruikt. De knop leek stuk, maar er
// kon nooit iets gebeuren.
//
// Het invulveld staat bewust achter een klik: op de meldingenlijst hoort geen permanent
// tekstvak per melding te staan. Zolang je niet antwoordt, is er niets te zien.
export default function ProblemReply({ id, email, naam }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (_p, fd) => replyProblemReport(fd), null);

  if (state?.ok) {
    return <p className="mt-2 text-xs font-bold text-accentdark">{state.message || `Antwoord verstuurd naar ${naam || email} ✓`}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-block text-xs font-bold text-accentdark hover:underline"
      >
        Antwoord {email} →
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 rounded-xl border border-borderc bg-white p-3">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="body"
        rows={4}
        required
        autoFocus
        placeholder={`Schrijf je antwoord aan ${naam || email}…`}
        className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm text-brand outline-none focus:border-accent"
      />
      <p className="mt-1 text-[11px] text-brand/45">Vertrekt vanaf info@fittin.be, met de melding eronder. De melding wordt meteen afgehandeld.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button disabled={pending} className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60">
          {pending ? "Verzenden…" : "Verstuur antwoord"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-xs font-bold text-brand/40 hover:text-brand">Annuleer</button>
        {state?.error && <span className="text-xs font-semibold text-red-500">{state.error}</span>}
      </div>
    </form>
  );
}
