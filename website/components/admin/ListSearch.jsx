"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Herbruikbaar zoekveld voor beheerlijsten. Owner-regel (2026-08-06): élke lijst moet doorzoekbaar
// zijn — een lijst van 200 betalingen zonder zoekveld dwingt je tot scrollen en Ctrl+F.
//
// Bewust via de URL (?q=) in plaats van client-side filteren: deze lijsten worden server-side
// gerenderd en zijn afgekapt (bv. 200 rijen). Client-side filteren zou enkel binnen die 200 zoeken
// en dus stilzwijgend resultaten missen; met een URL-parameter zoekt de database in álles. Extra
// voordeel: de zoekopdracht staat in de URL, dus je kan ze delen of bookmarken.
//
// Debounce van 350 ms zodat er niet bij elke toetsaanslag een navigatie vertrekt.
export default function ListSearch({ placeholder = "Zoeken…", param = "q", className = "" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(param) || "");

  useEffect(() => {
    const huidig = params.get(param) || "";
    if (value === huidig) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set(param, value.trim());
      else next.delete(param);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 350);
    return () => clearTimeout(t);
    // Bewust alleen op `value`: params/router/pathname mee laten triggeren zou bij elke navigatie
    // een nieuwe debounce starten en de zoekopdracht terugschrijven.
  }, [value]);

  return (
    <div className={"relative " + className}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-full border-2 border-borderc bg-white py-2 pl-4 pr-9 text-sm text-brand outline-none transition focus:border-accent"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Zoekopdracht wissen"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 text-brand/40 transition hover:text-brand"
        >
          ×
        </button>
      )}
    </div>
  );
}
