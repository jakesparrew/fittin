"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { applyAsCoach } from "./actions";
import { track } from "@/lib/track";

// Zelfde patroon als het intakeformulier: eigen client-formulier met een blijvend
// bevestigingsblok, want een aanmelding wordt pas dagen later beantwoord.
export default function CoachApplyForm() {
  const [pending, start] = useTransition();
  const [klaar, setKlaar] = useState(null);
  const [fout, setFout] = useState(null);

  const verstuur = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await applyAsCoach(fd);
      if (r?.error) { setFout(r.error); setKlaar(null); }
      else {
        if (!r?.already) track("coach_apply");
        setKlaar({ msg: r?.message || "Aanmelding verstuurd ✓", already: !!r?.already }); setFout(null);
      }
    });
  };

  if (klaar) {
    return (
      <div className="mt-10 rounded-3xl border-2 border-accent bg-accent/10 p-8 text-center">
        <p className="text-xl font-black text-brand">Aanmelding verstuurd 🙌</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-brand/70">
          {klaar.msg}{" "}
          {!klaar.already && "Je krijgt meteen een bevestigingsmail; we nemen binnen enkele dagen contact op voor een kennismaking. "}
          Hoor je niets? Mail{" "}
          <a href="mailto:info@fittin.be" className="font-bold text-accentdark hover:underline">info@fittin.be</a>.
        </p>
      </div>
    );
  }

  return (
    // method="post": zonder JavaScript mag een native submit de gegevens niet in de URL zetten.
    <form method="post" onSubmit={verstuur} className="mt-10 rounded-3xl border border-borderc bg-white p-6 md:p-8">
      {/* Honeypot — verborgen voor mensen, ingevuld door bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

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
          Telefoon <span className="font-normal text-ink-soft">(optioneel)</span>
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" className="mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
        <label className="block text-sm font-bold text-brand">
          Specialiteit <span className="font-normal text-ink-soft">(optioneel)</span>
          <input name="specialty" maxLength={120} placeholder="Bv. krachttraining, afvallen, revalidatie" className="mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
        <label className="block text-sm font-bold text-brand sm:col-span-2">
          Website of Instagram <span className="font-normal text-ink-soft">(optioneel)</span>
          <input name="socials" maxLength={300} placeholder="Zo krijgen we meteen een beeld van je werk" className="mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
        <label className="block text-sm font-bold text-brand sm:col-span-2">
          Vertel iets over jezelf
          <textarea name="about" rows={5} required maxLength={2000} placeholder="Je ervaring, je aanpak, eventuele certificaten — en of je al eigen klanten hebt." className="mt-1.5 w-full resize-none rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
      </div>

      {fout && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}

      <button disabled={pending} className="mt-6 w-full rounded-full bg-accent py-4 text-lg font-black text-brand transition hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-10">
        {pending ? "Versturen…" : "Meld je aan als coach"}
      </button>
      <p className="mt-3 text-xs text-ink-soft">
        We gebruiken je gegevens enkel om je aanmelding op te volgen — zie ons{" "}
        <Link href="/privacy" className="font-semibold text-accentdark hover:underline">privacybeleid</Link>.
      </p>
    </form>
  );
}
