"use client";
import { useEffect, useState } from "react";

// Wat er te zien is terwijl je coach schrijft. Eén scherm voor het plan én voor het weekmenu.
//
// DIT VERVANGT PlanBezig EN Bezig, en het verschil is niet de opmaak maar de inhoud. Die twee
// toonden een balk die heen en weer liep omdat er niets te tonen wás: de server deed één aanroep
// van 27 tot 50 seconden zonder een woord terug te sturen. Nu streamt de gateway (gemeten 11-09:
// eerste tekst na 1,6 seconden) en is alles hieronder ECHT:
//
//   - de stappen komen van de server, op het moment dat die stap begint;
//   - de tekst is de zin die je coach op dat ogenblik aan het schrijven is, letter voor letter;
//   - de dagen en sessies verschijnen zodra ze af zijn, niet zodra een timer denkt dat het mag.
//
// De enige verzonnen beweging die overblijft is het knipperende streepje achter de tekst. Dat is
// opmaak, geen bewering.

const STAPPEN = {
  plan: [
    { sleutel: "bewaren", t: "Je antwoorden bewaren" },
    { sleutel: "schrijven", t: "Je coach schrijft je plan" },
    { sleutel: "oefeningen", t: "Oefeningen kiezen uit de zaal" },
    { sleutel: "wegschrijven", t: "Je weekschema klaarzetten" },
  ],
  menu: [
    { sleutel: "schrijven", t: "Je coach stelt je week samen" },
    { sleutel: "wegschrijven", t: "Je boodschappenlijst klaarzetten" },
  ],
};

// Vanaf hier zegt het scherm dat het langer duurt dan gewoonlijk. Boven de gemeten bovengrens van
// een normale aanroep, zodat de melding iets betekent als ze verschijnt.
const TRAAG_NA = 60;

export default function Voortgang({ wat = "plan", stap = null, concept = null, compact = false }) {
  const [seconden, setSeconden] = useState(0);

  // De teller start pas NA de hydratatie. De klok lezen tijdens het renderen is precies het patroon
  // dat in dit project hydratatiefout #418 gaf.
  useEffect(() => {
    const tik = setInterval(() => setSeconden((n) => n + 1), 1000);
    return () => clearInterval(tik);
  }, []);

  const lijst = STAPPEN[wat] || STAPPEN.plan;
  // Nog geen bericht van de server = de eerste stap loopt.
  const nu = Math.max(0, lijst.findIndex((s) => s.sleutel === stap?.sleutel));
  const titel = wat === "menu" ? "Je coach stelt je weekmenu samen" : "Je coach stelt je plan samen";
  const groeiend = wat === "menu" ? concept?.toelichting : concept?.samenvatting;
  const af = wat === "menu" ? concept?.toelichtingAf : concept?.samenvattingAf;

  return (
    <div className={"anim-in rounded-3xl border border-borderc bg-surface " + (compact ? "p-5 text-left" : "p-6 text-left sm:p-8")}>
      <p className="text-[11px] font-bold uppercase tracking-widest text-accentdark">Even geduld</p>
      <h2 className={"mt-2 font-display font-black leading-tight text-ink " + (compact ? "text-lg" : "text-2xl")}>{titel}</h2>

      {/* De belofte die nu wél waar is. `after()` in de stroomroute houdt het werk in leven, ook
          als dit tabblad weg is — vroeger stond hier het tegenovergestelde, en terecht. */}
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
        Dit duurt ongeveer een halve minuut. <b className="text-ink">Je mag gerust wegklikken</b> —
        het wordt afgemaakt en staat klaar als je terugkomt.
      </p>

      <ol className="mt-5 space-y-2.5">
        {lijst.map((s, i) => {
          const gedaan = i < nu;
          const bezig = i === nu;
          return (
            <li key={s.sleutel} className="flex items-center gap-3">
              <span className={"grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black transition " +
                (gedaan ? "bg-accent text-brand" : bezig ? "border-2 border-accent text-accentdark" : "border-2 border-borderc text-ink/25")}>
                {gedaan ? "✓" : i + 1}
              </span>
              <span className={"text-sm transition " + (gedaan ? "text-ink/45" : bezig ? "font-bold text-ink" : "text-ink/30")}>
                {s.t}
              </span>
              {bezig && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  style={{ animation: "shimmer 1.2s var(--ease-in-uit) infinite" }} />
              )}
            </li>
          );
        })}
      </ol>

      {/* Wat je coach op dit moment schrijft. */}
      {groeiend ? (
        <div className="mt-5 rounded-2xl bg-paper px-4 py-3.5">
          <p className="text-sm leading-relaxed text-ink">
            {groeiend}
            {!af && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-accentdark" style={{ animation: "shimmer 1s steps(2) infinite" }} />}
          </p>
        </div>
      ) : null}

      {wat === "menu" && concept?.dagen?.length > 0 && <MenuVoorproef dagen={concept.dagen} />}
      {wat === "plan" && <PlanVoorproef weken={concept?.weken} sessies={concept?.sessies} />}

      <p className="mt-4 text-xs text-ink/45">
        {seconden}s bezig
        {seconden >= TRAAG_NA && (
          <span className="ml-2 text-amber-700">— dit duurt langer dan gewoonlijk, maar er loopt nog iets.</span>
        )}
      </p>
    </div>
  );
}

/** De dagen zoals ze binnenkomen. Dit is geen voorbeeld van het menu — het ís het menu. */
function MenuVoorproef({ dagen }) {
  const MOMENTEN = [["ontbijt", "Ontbijt"], ["lunch", "Lunch"], ["avondeten", "Avondeten"], ["tussendoor", "Tussendoor"]];
  return (
    <ul className="mt-4 space-y-2">
      {dagen.map((d) => (
        <li key={d.dag} className="anim-in rounded-2xl border border-borderc px-4 py-3">
          <p className="text-xs font-black capitalize text-ink">{d.dag}</p>
          <dl className="mt-1.5 space-y-1">
            {MOMENTEN.filter(([k]) => d[k]).map(([k, label]) => (
              <div key={k} className="flex gap-2 text-xs leading-relaxed">
                <dt className="w-20 shrink-0 text-ink/40">{label}</dt>
                <dd className="text-ink-soft">{d[k]}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** De weken en de sessies van week 1, zodra het model ze af heeft. */
function PlanVoorproef({ weken, sessies }) {
  if (!weken?.length && !sessies?.length) return null;
  return (
    <div className="mt-4 space-y-3">
      {weken?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {weken.map((w, i) => (
            <span key={i} className="anim-in rounded-full border border-borderc px-2.5 py-1 text-[11px] text-ink-soft">
              <b className="text-ink">W{w.nr || i + 1}</b> {w.focus}
            </span>
          ))}
        </div>
      )}
      {sessies?.length > 0 && (
        <ul className="space-y-1.5">
          {sessies.map((s, i) => (
            <li key={i} className="anim-in flex items-baseline gap-2 rounded-2xl border border-borderc px-4 py-2.5">
              <span className="text-xs font-black text-ink">{s.naam}</span>
              {s.blokken > 0 && <span className="text-[11px] text-ink/40">{s.blokken} oefeningen</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
