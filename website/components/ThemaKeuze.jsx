"use client";
import { useEffect, useState } from "react";

// De themaschakelaar: licht, donker, of je toestel volgen.
//
// Waarom LICHT de standaard is en niet "systeem": het merk is fel groen op wit, en de site is ook
// een etalage. Elke bezoeker met een donker toestel ongevraagd een donkere marketingpagina geven,
// is een productbeslissing en geen technische standaard. Wie het donker wil, kiest het hier — en
// "Volg mijn toestel" blijft bestaan voor wie zijn toestel wél wil laten beslissen.
//
// Waarom de knoppen pas ná de hydratatie de actieve stand tonen: de keuze staat in localStorage en
// die bestaat op de server niet. Meteen renderen zou betekenen dat de server "licht" tekent en de
// client een tel later "donker" — hydratatiefout #418, dezelfde als de klok tijdens het renderen.
// Het THEMA zelf staat al goed vóór de eerste verf; dat doet het scriptje in app/layout.jsx.
//
// TWEE MATEN, ÉÉN BRON. `kaart` staat op /account bij je instellingen; `voet` staat in de voetbalk
// van elke pagina, want daar zoekt een mens zoiets. Ze delen alles wat telt — dezelfde sleutel,
// dezelfde standen, hetzelfde schrijfmoment. Een tweede kopie van deze logica is precies hoe de
// ene schakelaar ooit iets anders bewaart dan de andere.

const SLEUTEL = "fittin-thema";

// Op /account staan ALLEBEI de maten tegelijk in beeld: de kaart bij je instellingen en de voetbalk
// eronder. Elke instantie houdt zijn eigen `stand`, dus zonder dit bericht bleef de ene de oude
// keuze aanwijzen nadat je in de andere geklikt had — twee schakelaars voor één instelling die
// verschillende dingen beweren. (Het `storage`-event volstaat niet: dat vuurt alleen in ANDERE
// tabbladen, nooit in het tabblad dat de wijziging zelf maakte.)
const WISSEL = "fittin:thema";

const STANDEN = [
  { v: "light", l: "Licht", k: "☀", u: "Het standaardthema" },
  { v: "dark", l: "Donker", k: "☾", u: "Altijd het donkere thema" },
  { v: "system", l: "Volg mijn toestel", k: "◐", u: "Donker zodra je telefoon of laptop dat is" },
];

export default function ThemaKeuze({ variant = "kaart" }) {
  const [stand, setStand] = useState(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem(SLEUTEL);
      setStand(["dark", "light", "system"].includes(t) ? t : "light");
    } catch { setStand("light"); }

    const volg = (e) => setStand(e.detail);
    window.addEventListener(WISSEL, volg);
    return () => window.removeEventListener(WISSEL, volg);
  }, []);

  function kies(v) {
    try {
      // "light" is de standaard, dus die hoeft niet bewaard te worden — behalve als iemand
      // terugschakelt vanaf een andere keuze; dan moet de oude waarde weg.
      if (v === "light") localStorage.removeItem(SLEUTEL);
      else localStorage.setItem(SLEUTEL, v);
    } catch { /* privémodus: de keuze geldt dan alleen voor deze pagina */ }
    // Het attribuut STAAT er nu ook voor "system": de mediaquery hangt daaraan, zodat het volgen
    // van het toestel een keuze is en niet de afwezigheid van een keuze.
    if (v === "light") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = v;
    // Eén bericht, alle maten volgen — inclusief deze.
    window.dispatchEvent(new CustomEvent(WISSEL, { detail: v }));
  }

  if (variant === "voet") return <InDeVoet stand={stand} kies={kies} />;

  return (
    <div className="flex flex-wrap gap-2">
      {STANDEN.map((s) => (
        <button key={s.v} type="button" onClick={() => kies(s.v)} title={s.u}
          aria-pressed={stand === s.v}
          className={"rounded-full px-4 py-2 text-sm font-bold transition " +
            (stand === s.v ? "bg-brand text-white" : "border-2 border-borderc text-ink/70 hover:border-accent")}>
          {s.l}
        </button>
      ))}
    </div>
  );
}

/**
 * De maat voor de voetbalk.
 *
 * DE GEKOZEN STAND IS EEN GROENE PIL. Dat is geen smaak maar de enige stand die door de twee regels
 * van de themasweep komt: een wit vlak is in componenten verbannen (het kaartvlak kreeg daarvoor een
 * eigen token, juist omdat wit óók de tekstkleur op donkere vlakken draagt en dus niet mocht
 * meeflippen), en de merkindigo als TEKSTkleur mag alleen op een vlak dat niet meeflipt. Het
 * merkgroen staat op die lijst. `lib/thema.test.js` bewaakt allebei en ving mijn eerste poging
 * meteen — en bovendien is groen op indigo gewoon de taal die de rest van de site al spreekt.
 *
 * ⚠️ Benoem hierboven geen klassenaam letterlijk: die test leest de RUWE bestandstekst, dus een
 * toelichting die de klasse noemt, laat hem afgaan. Zie de uitleg boven `inhoud` in dat bestand.
 *
 * De balk zelf is in BEIDE thema's donkerindigo, met gedempte en witte tekst erop — allebei kleuren
 * die niet meeflippen. Gemeten in de browser: gekozen 8,88:1, niet-gekozen 7,31:1 (licht) en
 * 6,98:1 (donker).
 */
function InDeVoet({ stand, kies }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-lav/70">Weergave</span>
      <span className="flex gap-1 rounded-full border border-white/15 p-0.5">
        {STANDEN.map((s) => (
          // De toegankelijke naam is de NAAM van de stand, niet de uitleg. Stond hier eerst de
          // uitleg, dan hoorde een schermlezer "Het standaardthema, knop" — dat benoemt geen thema,
          // het komt niet overeen met hoe dezelfde drie knoppen op /account heten, en wie met
          // spraakbediening "klik Licht" zegt, vindt niets. De uitleg blijft de tooltip.
          <button key={s.v} type="button" onClick={() => kies(s.v)} title={s.u} aria-label={s.l}
            aria-pressed={stand === s.v}
            // py-1.5 en niet py-0.5: gemeten was de knop 16 px hoog, en de ondergrens voor een
            // raakdoel is 24 (WCAG 2.5.8). Nu precies 24, wat hem ook niet groter maakt dan de
            // links ernaast in dezelfde balk.
            className={"rounded-full px-2.5 py-1.5 text-xs leading-none transition " +
              (stand === s.v ? "bg-accent font-bold text-brand" : "text-lav hover:text-white")}>
            <span aria-hidden>{s.k}</span>
          </button>
        ))}
      </span>
    </span>
  );
}
