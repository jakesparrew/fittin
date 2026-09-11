"use client";
import { useEffect, useState } from "react";

// Het wachtscherm terwijl je plan gemaakt wordt.
//
// DE EERSTE VERSIE TELDE UIT TOT 10,2 SECONDEN. Gemeten duurt de modelaanroep 27 tot 41 seconden —
// en bij een terugval naar het tweede model tot 180. Het scherm stond dus een halve minuut stil op
// 88%, met stap 4 ("Je eerste week klaarzetten") aan het draaien terwijl in werkelijkheid stap 2
// bezig was: het model schreef nog. Dat is geen tijdsprobleem dat je met betere schattingen oplost.
//
// GEMETEN VERHOUDING, uit de tijdstempels op productie:
//   de modelaanroep      27-41 s   (één fetch, geen tussenstappen, geen streaming)
//   al de rest samen      ~1 s     (bibliotheek ophalen, oefeningen kiezen, 15 schrijfrondes)
// Er is dus precies ÉÉN echte grens om te tonen, en die valt in de laatste seconde. Een scherm met
// vier stappen verzint er drie.
//
// DAAROM: twee stappen en een ONBEPAALDE balk. Geen percentage, want elk percentage hier is een
// verzinsel — en een verzinsel dat op 88% blijft staan, leest als "het hangt". Wat wél echt is: de
// verstreken tijd. Die telt gewoon door, hoe lang het ook duurt, en na drie kwartier minuut zegt
// het scherm er zelf iets over in plaats van te doen alsof alles volgens plan gaat.

const STAPPEN = [
  { t: "Je antwoorden bewaren", u: "doel, ervaring, dagen per week" },
  { t: "Je coach schrijft je plan", u: "acht weken, sessies en oefeningen uit de zaal" },
];

// Vanaf hier zegt het scherm dat het langer duurt dan gewoonlijk. Boven de gemeten bovengrens van
// een normale aanroep, zodat de melding iets betekent als ze verschijnt.
const TRAAG_NA = 45;

export default function PlanBezig({ stapAf = 0 }) {
  const [seconden, setSeconden] = useState(0);

  // De teller start pas NA de hydratatie. De klok lezen tijdens het renderen is precies het patroon
  // dat in dit project hydratatiefout #418 gaf.
  useEffect(() => {
    const tik = setInterval(() => setSeconden((n) => n + 1), 1000);
    return () => clearInterval(tik);
  }, []);

  const traag = seconden >= TRAAG_NA;

  return (
    <div className="anim-in rounded-3xl border border-borderc bg-surface p-6 sm:p-10">
      <p className="text-[11px] font-bold uppercase tracking-widest text-accentdark">Even geduld</p>
      <h2 className="mt-2 font-display text-2xl font-black leading-tight text-ink">
        Je coach stelt je plan samen
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
        Dit duurt meestal een halve minuut. <b className="text-ink">Laat dit scherm openstaan</b> —
        sluit je het nu, dan wordt je plan niet afgemaakt en moet je opnieuw beginnen.
      </p>

      {/* Een ONBEPAALDE balk: een lichtje dat heen en weer loopt, geen percentage. De client weet
          niet hoe ver de server staat, en dat mag hij ook niet suggereren. `shimmer` staat al in
          globals.css en respecteert reduced-motion via de universele regel daar. */}
      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-borderc">
        <div className="h-full w-1/3 rounded-full bg-accent"
          style={{ animation: "shimmer 1.6s var(--ease-in-uit) infinite", transform: "translateX(-100%)" }} />
      </div>

      <ol className="mt-6 space-y-3">
        {STAPPEN.map((s, i) => {
          const af = i < stapAf;
          const bezig = i === stapAf;
          return (
            <li key={s.t} className="flex items-start gap-3">
              <span className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black transition " +
                (af ? "bg-accent text-brand" : bezig ? "border-2 border-accent text-accentdark" : "border-2 border-borderc text-ink/25")}>
                {af ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span className={"block text-sm font-bold " + (af || bezig ? "text-ink" : "text-ink/35")}>{s.t}</span>
                <span className={"block text-xs " + (af || bezig ? "text-ink-soft" : "text-ink/25")}>{s.u}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* Het enige echte getal op dit scherm. */}
      <p className="mt-5 border-t border-borderc pt-4 text-xs text-ink/45">
        {seconden}s bezig
        {traag && (
          <span className="ml-2 text-amber-700">
            — dit duurt langer dan gewoonlijk. Je coach is nog aan het schrijven; niets is misgelopen.
          </span>
        )}
      </p>
    </div>
  );
}
