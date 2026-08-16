"use client";
import { useState, useTransition } from "react";
import { sendHelpRequest } from "./actions";

// Eén formulier voor iedereen. Wie ingelogd is hoeft naam en e-mail niet in te vullen — die kennen
// we al, en elk extra veld is een reden om af te haken op het moment dat iemand net vastloopt.
export default function HelpForm({ ingelogd }) {
  const [pending, start] = useTransition();
  const [klaar, setKlaar] = useState(null);
  const [fout, setFout] = useState(null);

  const verstuur = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("page", typeof location !== "undefined" ? location.pathname : "");
    start(async () => {
      const r = await sendHelpRequest(fd);
      if (r?.error) { setFout(r.error); setKlaar(null); }
      else { setKlaar(r?.message || "Verstuurd ✓"); setFout(null); }
    });
  };

  if (klaar) {
    return (
      <div className="rounded-3xl border-2 border-accent bg-accent/10 p-6 text-center">
        <p className="text-lg font-black text-brand">Verstuurd 🙌</p>
        <p className="mt-1 text-sm text-brand/70">{klaar}</p>
      </div>
    );
  }

  return (
    <form onSubmit={verstuur} className="rounded-3xl border border-borderc bg-white p-6">
      <h2 className="font-black text-brand">Stuur ons je vraag</h2>
      <p className="mt-1 text-sm text-brand/55">
        {ingelogd
          ? "We zien wie je bent en waar je vastliep — beschrijf gewoon wat er misgaat."
          : "Vul je gegevens in, dan antwoorden we per mail."}
      </p>

      {!ingelogd && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Je naam</span>
            <input name="name" required className="w-full rounded-xl border-2 border-borderc px-3 py-2.5 text-sm text-brand outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Je e-mail</span>
            <input name="email" type="email" required className="w-full rounded-xl border-2 border-borderc px-3 py-2.5 text-sm text-brand outline-none focus:border-accent" />
          </label>
        </div>
      )}

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-lav">Waarmee kunnen we helpen?</span>
        <textarea name="message" required rows={5} placeholder="Bv. de deur ging niet open, mijn betaling lukte niet, ik raak niet ingelogd…"
          className="w-full rounded-xl border-2 border-borderc px-3 py-2.5 text-sm text-brand outline-none focus:border-accent" />
      </label>

      {/* Honeypot: onzichtbaar voor mensen, onweerstaanbaar voor bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      {fout && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}

      <button disabled={pending} className="mt-4 w-full rounded-full bg-accent px-6 py-3 text-sm font-black text-brand transition hover:opacity-90 disabled:opacity-50">
        {pending ? "Versturen…" : "Verstuur je vraag"}
      </button>
      <p className="mt-2 text-center text-[11px] text-brand/45">Meestal antwoorden we dezelfde dag.</p>
    </form>
  );
}
