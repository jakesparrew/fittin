"use client";
import { useEffect, useState } from "react";

// Het wachtscherm terwijl je plan gemaakt wordt. Duurt gemeten een tiental seconden — lang genoeg
// dat een knop met "bezig…" voelt alsof er niets gebeurt, en lang genoeg dat mensen opnieuw klikken.
//
// EERLIJKHEID BOVEN PRECISIE. Het is één modelaanroep; de server stuurt geen voortgang terug. We
// doen dus niet alsof we weten hoe ver hij staat:
//   • stap 1 is ECHT af wanneer `bewaarIntake` terugkomt — die grens kennen we;
//   • de stappen daarna lichten op volgens een tijdschatting uit de gemeten duur, en de laatste
//     stap blijft draaien tot de server antwoordt. Hij slaat dus nooit om naar "klaar" voordat het
//     echt klaar is.
// Geen percentage, want een percentage dat we niet kennen is een leugen met twee cijfers achter de
// komma. Wel een balk die vooruitgaat en stappen die benoemen wat er gebeurt.

const STAPPEN = [
  { t: "Je antwoorden bewaren", u: "doel, ervaring, dagen per week" },
  { t: "Je coach stelt je weken op", u: "dit is het stuk dat even duurt" },
  { t: "Oefeningen kiezen uit de zaal", u: "886 oefeningen, afgestemd op je niveau" },
  { t: "Je eerste week klaarzetten", u: "sessies, reeksen en rust" },
];

// Gemeten: de modelaanroep is veruit het langst. Deze verdeling laat de balk niet halverwege
// stilvallen, en loopt bewust NIET vol — vol betekent klaar, en dat bepaalt de server.
const DUUR = [700, 7000, 2500, 1800];

export default function PlanBezig({ stapAf = 0 }) {
  const [actief, setActief] = useState(0);

  useEffect(() => {
    if (actief >= STAPPEN.length - 1) return;
    // Nooit terugspringen: is stap 1 echt af, dan mag de teller daar niet meer onder.
    const wacht = setTimeout(() => setActief((n) => Math.max(n + 1, stapAf)), DUUR[actief]);
    return () => clearTimeout(wacht);
  }, [actief, stapAf]);

  useEffect(() => { setActief((n) => Math.max(n, stapAf)); }, [stapAf]);

  // Maximaal 92%: de laatste sprong hoort bij het échte antwoord van de server.
  const deel = Math.min(92, Math.round(((actief + 0.5) / STAPPEN.length) * 100));

  return (
    <div className="anim-in rounded-3xl border border-borderc bg-surface p-6 sm:p-10">
      <p className="text-[11px] font-bold uppercase tracking-widest text-accentdark">Even geduld</p>
      <h2 className="mt-2 font-display text-2xl font-black leading-tight text-ink">
        Je coach stelt je plan samen
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
        Dit duurt een tiental seconden. Laat dit scherm openstaan — sluit je het, dan wordt je plan
        alsnog afgemaakt, maar zie je het pas bij de volgende keer dat je langskomt.
      </p>

      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-borderc">
        <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-uit"
          style={{ width: `${deel}%` }} />
      </div>

      <ol className="mt-6 space-y-3">
        {STAPPEN.map((s, i) => {
          const af = i < actief;
          const bezig = i === actief;
          return (
            <li key={s.t} className="flex items-start gap-3">
              <span className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black " +
                (af ? "bg-accent text-brand" : bezig ? "border-2 border-accent text-accentdark" : "border-2 border-borderc text-ink/25")}>
                {af ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span className={"block text-sm font-bold " + (af || bezig ? "text-ink" : "text-ink/35")}>
                  {s.t}
                  {bezig && <span className="ml-2 inline-block animate-pulse text-accentdark">•••</span>}
                </span>
                <span className={"block text-xs " + (af || bezig ? "text-ink-soft" : "text-ink/25")}>{s.u}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
