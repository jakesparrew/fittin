"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zetVoeding } from "@/app/(site)/coaching/actions";
import { VOEDINGSVOORKEUREN } from "@/lib/coaching/voeding-velden.js";
import Voortgang from "./Voortgang";
import { useStroom } from "./stroom";

// Het weekmenu. Één week, zeven dagen, vier momenten — en een boodschappenlijst die je meeneemt
// naar de winkel.
//
// Waarom de dagen ingeklapt staan op één na: een menu van zeven dagen in één keer is een muur
// tekst. Je hebt vandaag nodig, niet donderdag. De volledige week staat er wel, één tik weg.

const MOMENTEN = [
  ["ontbijt", "Ontbijt"],
  ["lunch", "Lunch"],
  ["avondeten", "Avondeten"],
  ["tussendoor", "Tussendoor"],
];

const DAGNAMEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

export default function MaaltijdPaneel({ menu, profiel, kanMaken }) {
  const router = useRouter();
  const [bezig, start] = useTransition();
  const [melding, setMelding] = useState(null);
  const stroom = useStroom();
  const [open, setOpen] = useState(null);
  const [voorkeuren, setVoorkeuren] = useState(profiel?.coaching_voeding || []);
  const [vrij, setVrij] = useState(profiel?.coaching_voeding_vrij || "");

  // Vandaag openklappen gebeurt ná de hydratatie. De klok tijdens het renderen lezen is precies hoe
  // deze app ooit aan een reeks #418-hydratatiefouten kwam: de server staat in UTC, de bezoeker niet.
  useEffect(() => { setOpen(DAGNAMEN[new Date().getDay()]); }, []);

  // Het menu komt via de stroomroute en niet via de serveractie: die laatste gaf 27 tot 50 seconden
  // lang niets terug en hield het lid aan het scherm vast. Nu komt de week binnen terwijl ze
  // geschreven wordt, en loopt het werk door als je wegklikt.
  async function vraagMenu(opnieuw) {
    setMelding(null);
    const uit = await stroom.start({ wat: "menu", opnieuw: !!opnieuw });
    if (uit?.losgekoppeld) {
      setMelding("De verbinding viel weg, maar je coach werkt door. Ververs deze pagina zo dadelijk.");
      return;
    }
    setMelding(uit?.error || uit?.message || null);
    if (uit?.ok) router.refresh();
  }

  function bewaarVoorkeuren() {
    setMelding(null);
    start(async () => {
      const fd = new FormData();
      for (const v of voorkeuren) fd.append("voeding", v);
      fd.set("voeding_vrij", vrij);
      const r = await zetVoeding(fd);
      setMelding(r?.error || r?.message || null);
    });
  }

  const dagen = Array.isArray(menu?.menu) ? menu.menu : [];

  // Tijdens het samenstellen vervangt de voortgang het paneel. Ook bij "liever iets anders": dan
  // kijk je naar het nieuwe menu dat geschreven wordt in plaats van naar het oude dat weggaat.
  if (stroom.bezig) return <Voortgang wat="menu" stap={stroom.stap} concept={stroom.concept} />;

  return (
    <div className="space-y-4">
      {!dagen.length ? (
        <div className="rounded-3xl border-2 border-dashed border-borderc bg-surface p-6 text-center">
          <p className="font-display text-lg font-black text-ink">Nog geen menu voor deze week</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">
            Je coach stelt een weekmenu samen dat past bij je doel en je voorkeuren, met een
            boodschappenlijst erbij. Elke zondag loopt het mee met je nieuwe week.
          </p>
          {kanMaken ? (
            <button type="button" onClick={() => vraagMenu(false)}
              className="mt-4 rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">
              Stel mijn weekmenu samen
            </button>
          ) : (
            <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm text-ink-soft">
              Vul eerst je gewicht, lengte en geboortedatum in bij je gegevens — zonder die drie kan
              een menu alleen maar gokken.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-borderc bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-accentdark">Je weekmenu</p>
              {menu.kcal_richtlijn ? (
                <p className="text-xs text-ink/45">Richtlijn ± {menu.kcal_richtlijn} kcal per dag</p>
              ) : null}
            </div>
            {menu.toelichting && <p className="mt-2 text-sm leading-relaxed text-ink">{menu.toelichting}</p>}

            <ul className="mt-4 space-y-2">
              {dagen.map((d) => {
                const uit = open === d.dag;
                const gevuld = MOMENTEN.filter(([k]) => d[k]);
                if (!gevuld.length) return null;
                return (
                  <li key={d.dag} className={"overflow-hidden rounded-2xl border-2 transition " + (uit ? "border-accent/40" : "border-borderc")}>
                    <button type="button" onClick={() => setOpen(uit ? null : d.dag)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-paper/60">
                      <span className="flex-1 text-sm font-black capitalize text-ink">{d.dag}</span>
                      <span className="text-xs text-ink/35">{uit ? "▲" : "▼"}</span>
                    </button>
                    {uit && (
                      <dl className="anim-in border-t border-borderc px-4 pb-4 pt-3">
                        {gevuld.map(([k, label]) => (
                          <div key={k} className="mt-2.5 first:mt-0">
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{label}</dt>
                            <dd className="mt-0.5 text-sm leading-relaxed text-ink">{d[k]}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {Array.isArray(menu.boodschappen) && menu.boodschappen.length > 0 && (
            <Boodschappen lijst={menu.boodschappen} weeknummer={menu.weeknummer} />
          )}

          {kanMaken && (
            <button type="button" disabled={bezig} onClick={() => vraagMenu(true)}
              className="text-xs font-bold text-ink/45 underline transition hover:text-ink disabled:opacity-50">
              {bezig ? "Bezig…" : "Liever iets anders — stel een nieuw menu samen"}
            </button>
          )}
        </>
      )}

      <details className="rounded-3xl border border-borderc bg-surface p-5">
        <summary className="cursor-pointer text-sm font-black text-ink">Wat eet je niet?</summary>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Dit geldt vanaf je volgende menu. Gaat het over een aandoening, medicatie, zwangerschap of
          een eetstoornis, dan stopt je coach en verwijst hij je door — dat hoort bij een diëtist.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {VOEDINGSVOORKEUREN.map((v) => {
            const aan = voorkeuren.includes(v.v);
            return (
              <button key={v.v} type="button"
                onClick={() => setVoorkeuren((l) => (aan ? l.filter((x) => x !== v.v) : [...l, v.v]))}
                className={"rounded-full border-2 px-3.5 py-1.5 text-xs font-bold transition " + (aan ? "border-accent bg-accent/10 text-ink" : "border-borderc text-ink/60 hover:border-lav")}>
                {v.l}
              </button>
            );
          })}
        </div>
        <textarea rows={2} maxLength={300} value={vrij} onChange={(e) => setVrij(e.target.value)}
          placeholder="Bv. geen paprika, ik kook 's avonds voor twee"
          className="mt-3 w-full resize-none rounded-xl border-2 border-borderc px-3.5 py-2.5 text-base font-normal text-ink outline-none transition focus:border-accent" />
        <button type="button" disabled={bezig} onClick={bewaarVoorkeuren}
          className="mt-3 rounded-full border-2 border-borderc bg-surface px-5 py-2 text-xs font-bold text-ink transition hover:border-lav disabled:opacity-60">
          Bewaren
        </button>
      </details>

      {melding && <p className="rounded-xl bg-paper px-4 py-3 text-sm font-bold text-ink">{melding}</p>}
    </div>
  );
}

/** De boodschappenlijst, met vinkjes die alleen in dit scherm leven. */
function Boodschappen({ lijst, weeknummer }) {
  const [af, setAf] = useState([]);
  return (
    <details className="rounded-3xl border border-borderc bg-surface p-5">
      <summary className="cursor-pointer text-sm font-black text-ink">
        Boodschappen voor week {weeknummer} ({lijst.length})
      </summary>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {lijst.map((r, i) => {
          const gedaan = af.includes(i);
          return (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-paper">
                <input type="checkbox" checked={gedaan} onChange={() => setAf((l) => (gedaan ? l.filter((x) => x !== i) : [...l, i]))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
                <span className={"text-sm transition " + (gedaan ? "text-ink/35 line-through" : "text-ink")}>{r}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink/40">De vinkjes zijn voor in de winkel — ze worden niet bewaard.</p>
    </details>
  );
}
