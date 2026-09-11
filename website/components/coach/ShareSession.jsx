"use client";
import { useState } from "react";
import { deel } from "@/lib/native/share";

// Coaches trainen vaak mensen die géén Fittin-account hebben (de naam staat enkel in
// bookings.notes). Die client kreeg dus nooit een bevestiging: de coach typte datum, uur en
// adres met de hand over in WhatsApp — met de fouten van dien. Deze knop maakt dat bericht.
//
// Bewust GEEN deurcode in het bericht. Niet uit voorzichtigheid, maar omdat ze nog niet bestaat:
// Nuki maakt de keypadcode voor een boeking pas ~5 min vóór de start aan, en dit bericht stuur je
// dagen op voorhand. De coach is bij een PT-sessie sowieso zelf aanwezig en laat de client binnen,
// dus het bericht zegt dat gewoon.
export default function ShareSession({ text, className = "" }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;

  // Deelvenster weggeklikt of clipboard geweigerd: geen melding — de WhatsApp-knop werkt altijd nog.
  async function copy() {
    if ((await deel({ text })) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <span className={"inline-flex items-center gap-1 " + className}>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Stuur de sessiedetails naar je client via WhatsApp"
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-borderc bg-surface px-3 py-1.5 text-xs font-bold text-ink transition hover:border-accent"
      >
        📲 Stuur naar client
      </a>
      <button
        type="button"
        onClick={copy}
        title="Kopieer het bericht"
        className="rounded-full px-2 py-1.5 text-xs font-bold text-ink/45 transition hover:text-ink"
      >
        {copied ? "✓" : "📋"}
      </button>
    </span>
  );
}
