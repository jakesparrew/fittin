"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { requestIntake } from "./actions";
import { FORMULES } from "./options";

// De enige conversieroute van personal training. Zelfde patroon als hulp/HelpForm.jsx: een eigen
// client-formulier in plaats van ActionForm, want een toast van enkele seconden is te weinig
// bevestiging voor een aanvraag die pas dagen later beantwoord wordt.
export default function IntakeForm({ coaches = [] }) {
  const [pending, start] = useTransition();
  const [klaar, setKlaar] = useState(null);
  const [fout, setFout] = useState(null);
  const [coachId, setCoachId] = useState("");

  // ?coach=<slug> komt van de coachpagina's. We lezen hem in de browser i.p.v. via searchParams,
  // zodat de pagina zelf statisch geprerenderd kan blijven.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("coach");
    if (!wanted) return;
    const hit = coaches.find((c) => c.slug === wanted || c.id === wanted);
    if (hit) setCoachId(hit.id);
  }, [coaches]);

  const verstuur = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await requestIntake(fd);
      if (r?.error) { setFout(r.error); setKlaar(null); }
      else { setKlaar({ msg: r?.message || "Aanvraag verstuurd ✓", already: !!r?.already }); setFout(null); }
    });
  };

  if (klaar) {
    return (
      <div className="mt-10 rounded-3xl border-2 border-accent bg-accent/10 p-8 text-center">
        <p className="text-xl font-black text-brand">Aanvraag verstuurd 🙌</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-brand/70">
          {klaar.msg}{" "}
          {!klaar.already && "Je krijgt meteen een bevestigingsmail; we mailen je binnen 1 werkdag om een moment te prikken. "}
          Hoor je niets? Mail{" "}
          <a href="mailto:info@fittin.be" className="font-bold text-accentdark hover:underline">info@fittin.be</a>.
        </p>
      </div>
    );
  }

  const gekozenCoach = coaches.find((c) => c.id === coachId);

  return (
    <form onSubmit={verstuur} className="mt-10 rounded-3xl border border-borderc bg-white p-6 md:p-8">
      {/* Honeypot — verborgen voor mensen, ingevuld door bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {coaches.length < 2 && <input type="hidden" name="coachId" value={coachId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-brand">
          Naam
          <input name="name" required maxLength={120} autoComplete="name" className="mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
        <label className="block text-sm font-bold text-brand">
          E-mail
          <input name="email" type="email" required maxLength={200} autoComplete="email" className="mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
        <label className="block text-sm font-bold text-brand">
          Telefoon <span className="font-normal text-brand/40">(optioneel)</span>
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" className="mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
        <label className="block text-sm font-bold text-brand">
          Formule
          <select name="formule" defaultValue="Weet ik nog niet" className="mt-1.5 w-full rounded-xl border-2 border-borderc bg-white px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent">
            {FORMULES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>

        {coaches.length >= 2 && (
          <label className="block text-sm font-bold text-brand sm:col-span-2">
            Voorkeurcoach <span className="font-normal text-brand/40">(optioneel)</span>
            <select name="coachId" value={coachId} onChange={(e) => setCoachId(e.target.value)} className="mt-1.5 w-full rounded-xl border-2 border-borderc bg-white px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent">
              <option value="">Geen voorkeur — kies samen tijdens de intake</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        <label className="block text-sm font-bold text-brand sm:col-span-2">
          Wanneer kan je meestal? <span className="font-normal text-brand/40">(optioneel)</span>
          <input name="when" maxLength={200} placeholder="Bv. weekdagen na 18u, of zaterdagvoormiddag" className="mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>

        <label className="block text-sm font-bold text-brand sm:col-span-2">
          Wat is je doel? <span className="font-normal text-brand/40">(optioneel)</span>
          <textarea name="goal" rows={4} maxLength={2000} placeholder="Bv. sterker worden, afvallen, terug in conditie komen…" className="mt-1.5 w-full resize-none rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
      </div>

      {coaches.length < 2 && gekozenCoach && (
        <p className="mt-4 text-sm font-semibold text-brand/70">Je aanvraag gaat naar {gekozenCoach.name}.</p>
      )}
      {fout && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}

      <button disabled={pending} className="mt-6 w-full rounded-full bg-accent py-4 text-lg font-black text-brand transition hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-10">
        {pending ? "Versturen…" : "Vraag gratis intake aan"}
      </button>
      <p className="mt-3 text-xs text-brand/40">
        We gebruiken je gegevens enkel om je intake in te plannen — zie ons{" "}
        <Link href="/privacy" className="font-semibold text-accentdark hover:underline">privacybeleid</Link>.
      </p>
    </form>
  );
}
