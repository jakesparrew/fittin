"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { applyAsCoach } from "./actions";
import { track } from "@/lib/track";
import { MAX_BYTES, MAX_MB } from "@/lib/coach-aanmelding";

// Zelfde patroon als het intakeformulier: eigen client-formulier met een blijvend
// bevestigingsblok, want een aanmelding wordt pas dagen later beantwoord.
export default function CoachApplyForm() {
  const [pending, start] = useTransition();
  const [klaar, setKlaar] = useState(null);
  const [fout, setFout] = useState(null);
  const [cvNaam, setCvNaam] = useState(null);
  const [fotoNaam, setFotoNaam] = useState(null);
  const formRef = useRef(null);

  // Kiest iemand een bestand vóór React klaar is met hydrateren, dan is die change-gebeurtenis weg:
  // het bestand zit wél in de input (versturen werkt gewoon), maar de knop blijft "Cv als pdf"
  // tonen alsof er niets gebeurd is. Op een trage telefoon is dat het verschil tussen "het werkte"
  // en "ik klik nog eens". Daarom bij het aankoppelen één keer uitlezen wat er al staat.
  useEffect(() => {
    const f = formRef.current;
    if (!f) return;
    setCvNaam(f.elements.cv?.files?.[0]?.name || null);
    setFotoNaam(f.elements.photo?.files?.[0]?.name || null);
  }, []);

  const verstuur = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Te groot bestand hier al tegenhouden: anders vertrekt er 20 MB over de lijn om daarna alsnog
    // afgekeurd te worden — op een trage verbinding is dat een minuut wachten voor niets.
    const teGroot = ["cv", "photo"].map((k) => fd.get(k)).find((f) => f && typeof f !== "string" && f.size > MAX_BYTES);
    if (teGroot) { setFout(`"${teGroot.name}" is te groot (max ${MAX_MB} MB).`); return; }
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
    <form ref={formRef} method="post" onSubmit={verstuur} className="mt-10 rounded-3xl border border-borderc bg-white p-6 md:p-8">
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

        {/* Bijlagen. Optioneel en bewust onderaan: wie snel wil aanmelden hoeft niets te zoeken,
            wie een cv klaar heeft staan, kan het meteen meesturen. */}
        <div className="sm:col-span-2">
          <p className="text-sm font-bold text-brand">Cv en foto <span className="font-normal text-ink-soft">(optioneel)</span></p>
          <p className="mt-1 text-xs text-ink-soft">Max {MAX_MB} MB per bestand. Alleen wij zien ze — ze komen niet op de site.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Bijlage
              naam="cv"
              label="Cv als pdf"
              accept="application/pdf,.pdf"
              gekozen={cvNaam}
              onKies={(f) => { setCvNaam(f?.name || null); setFout(null); }}
            />
            <Bijlage
              naam="photo"
              label="Foto van jezelf"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              gekozen={fotoNaam}
              onKies={(f) => { setFotoNaam(f?.name || null); setFout(null); }}
            />
          </div>
        </div>
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

// Een kale <input type="file"> ziet er in elke browser anders uit en zegt "Geen bestand gekozen".
// Dit is dezelfde invoer, met een knop die bij de rest van het formulier past en die na de keuze
// toont wat er gekozen is — anders weet je niet of je klik gelukt is.
function Bijlage({ naam, label, accept, gekozen, onKies }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-borderc px-3.5 py-3 transition hover:border-accent">
      <input
        type="file"
        name={naam}
        accept={accept}
        className="sr-only"
        onChange={(e) => onKies(e.currentTarget.files?.[0] || null)}
      />
      <span className="shrink-0 rounded-full bg-paper px-3 py-1.5 text-xs font-black text-brand">Kies</span>
      <span className={"min-w-0 flex-1 truncate text-sm " + (gekozen ? "font-semibold text-brand" : "text-ink-soft")}>
        {gekozen || label}
      </span>
      {gekozen && <span className="shrink-0 text-sm font-black text-accentdark">✓</span>}
    </label>
  );
}
