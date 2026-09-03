"use client";
import { useState } from "react";
import { SPECIALTIES, joinSpecialties, matchKnown } from "@/lib/coach-specialties";

// Toggle-chips voor de coachspecialiteit. Vervangt het vrije tekstveld. De geselecteerde labels
// gaan als één " · "-string in een verborgen input met dezelfde naam ("specialty"), zodat de
// bestaande opslag-acties (adminSaveCoachProfile, coach-profiel) onveranderd blijven werken.
//
// Bij het openen worden de labels voorgeselecteerd die in de huidige waarde voorkomen — ook als
// die ooit als vrije tekst is ingevuld. Zo verliest een coach zijn bestaande specialiteit niet.
export default function SpecialtyPicker({ name = "specialty", defaultValue = "", max = 4 }) {
  const [gekozen, setGekozen] = useState(() => new Set(matchKnown(defaultValue)));

  const toggle = (label) => {
    setGekozen((s) => {
      const next = new Set(s);
      if (next.has(label)) next.delete(label);
      else if (next.size < max) next.add(label);
      return next;
    });
  };

  const waarde = joinSpecialties(SPECIALTIES.filter((s) => gekozen.has(s)));

  return (
    <div>
      <input type="hidden" name={name} value={waarde} />
      <div className="flex flex-wrap gap-2">
        {SPECIALTIES.map((label) => {
          const aan = gekozen.has(label);
          const vol = !aan && gekozen.size >= max;
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(label)}
              disabled={vol}
              className={
                "rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition " +
                (aan
                  ? "border-accent bg-accent/10 text-brand"
                  : vol
                    ? "cursor-not-allowed border-borderc text-brand/25"
                    : "border-borderc text-ink-soft hover:border-lav hover:text-brand")
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">Kies er maximaal {max}. Ze verschijnen als labels op je profiel.</p>
    </div>
  );
}
