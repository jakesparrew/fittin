"use client";
import { useState, useTransition } from "react";
import { bewaarIntake, startPlan } from "@/app/(site)/coaching/actions";
import { VOEDINGSVOORKEUREN } from "@/lib/coaching/voeding-velden.js";
import { GESLACHTEN } from "@/lib/aanmelding-velden";
import PlanBezig from "./PlanBezig";

// Eén vraag per scherm, met bij elke vraag waarom we het vragen. Dat laatste is geen beleefdheid:
// wie niet weet waarom je zijn gewicht vraagt, vult iets in of haakt af. En de gezondheidsvraag
// staat achter een eigen, expliciete toestemming — die hoort niet als bijvangst mee te glijden.
//
// Zelfde selectie-idioom als het boekingsscherm: accentrand + accent/10 = gekozen. Terug bewaart
// de antwoorden; halverwege stoppen verliest niets, want er wordt pas weggeschreven op het einde.

const KNOP = "w-full rounded-2xl border-2 px-4 py-3.5 text-left text-sm font-bold transition ";
const AAN = "border-accent bg-accent/10 text-ink";
const UIT = "border-borderc text-ink/70 hover:border-lav";
const VELD = "mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-base font-normal text-ink outline-none transition focus:border-accent";

const DOELEN = [
  { v: "sterker", l: "Sterker worden", u: "Meer kracht, zwaardere gewichten." },
  { v: "spiermassa", l: "Spiermassa opbouwen", u: "Zichtbaar meer spier." },
  { v: "afvallen", l: "Afvallen", u: "Training die je verbruik omhoog haalt." },
  { v: "conditie", l: "Conditie verbeteren", u: "Langer volhouden, sneller herstellen." },
  { v: "bewegen", l: "Gewoon regelmatig bewegen", u: "Geen doel, wel ritme." },
];
const MODULEKEUZE = [
  { v: "mealplan", l: "Meal plan", u: "Elke week een menu met boodschappenlijst, afgestemd op je doel." },
  { v: "motivatie", l: "Motivatie", u: "Een bericht wanneer je een mijlpaal haalt. Geen dagelijkse duwtjes." },
];
const ERVARING = [
  { v: "nooit", l: "Nog nooit", u: "We beginnen bij de basis, met uitleg." },
  { v: "soms", l: "Af en toe", u: "Je kent de oefeningen, we bouwen op." },
  { v: "vaak", l: "Regelmatig", u: "Je bent vertrouwd met vrije gewichten." },
];

export default function IntakeWizard({ profiel }) {
  const [stap, setStap] = useState(1);
  const [bezig, start] = useTransition();
  const [fout, setFout] = useState(null);
  // Hoe ver het wachtscherm ECHT staat. Alleen stap 1 kennen we met zekerheid (bewaarIntake is een
  // aparte serveractie); de rest schat PlanBezig. Zie daar waarom we geen percentage verzinnen.
  const [maken, setMaken] = useState(false);
  const [stapAf, setStapAf] = useState(0);

  const [doel, setDoel] = useState(profiel?.coaching_doel || "");
  const [ervaring, setErvaring] = useState(profiel?.coaching_ervaring || "");
  const [dagen, setDagen] = useState(profiel?.coaching_dagen || 3);
  const [weken, setWeken] = useState(8);
  const [toon, setToon] = useState(profiel?.coaching_toon || "rustig");
  // Workouts staat vast — daar hangt het weekritme aan. Meal plan en Motivatie zijn keuzes.
  const [modules, setModules] = useState(
    Array.isArray(profiel?.coaching_modules) && profiel.coaching_modules.length
      ? profiel.coaching_modules.filter((m) => m !== "workouts")
      : ["motivatie"]
  );
  const [voeding, setVoeding] = useState(profiel?.coaching_voeding || []);
  const [voedingVrij, setVoedingVrij] = useState(profiel?.coaching_voeding_vrij || "");
  const [toestemming, setToestemming] = useState(!!profiel?.coaching_toestemming_at);
  const [geboortedatum, setGeboortedatum] = useState(profiel?.geboortedatum || "");
  const [geslacht, setGeslacht] = useState(profiel?.geslacht || "");
  const [gewicht, setGewicht] = useState(profiel?.gewicht_kg || "");
  const [lengte, setLengte] = useState(profiel?.height_cm || "");
  const [beperkingen, setBeperkingen] = useState(profiel?.coaching_beperkingen || "");

  const LAATSTE = 7;
  const verder = () => { setFout(null); setStap((s) => Math.min(LAATSTE, s + 1)); };
  const terug = () => { setFout(null); setStap((s) => Math.max(1, s - 1)); };

  function afronden() {
    setFout(null);
    setStapAf(0);
    setMaken(true);
    start(async () => {
      const fd = new FormData();
      fd.set("doel", doel);
      fd.set("ervaring", ervaring);
      fd.set("dagen", String(dagen));
      fd.set("weken", String(weken));
      fd.set("toon", toon);
      for (const m of modules) fd.append("modules", m);
      if (modules.includes("mealplan")) {
        for (const v of voeding) fd.append("voeding", v);
        fd.set("voeding_vrij", voedingVrij);
      }
      fd.set("toestemming", toestemming ? "ja" : "nee");
      if (toestemming) {
        if (geboortedatum) fd.set("geboortedatum", geboortedatum);
        if (geslacht) fd.set("geslacht", geslacht);
        if (gewicht) fd.set("gewicht", String(gewicht));
        if (lengte) fd.set("lengte", String(lengte));
        if (beperkingen) fd.set("beperkingen", beperkingen);
      }
      // ALLES in een try: `maakPlan` gooit op vier plekken (de bibliotheek, het wegschrijven van
      // een week, van de dagen en van de sessies). Niets ving dat op, en dan bleef het wachtscherm
      // eeuwig draaien — een tweede, volledig onafhankelijke oorzaak van "het blijft laden" die
      // geen enkele voortgangsweergave oplost.
      try {
        const bewaard = await bewaarIntake(fd);
        if (bewaard?.error) { setFout(bewaard.error); setMaken(false); return; }
        // De enige grens die we echt kennen: de antwoorden staan opgeslagen.
        setStapAf(1);

        const planFd = new FormData();
        planFd.set("weken", String(weken));
        const gemaakt = await startPlan(planFd);
        // Terug naar het formulier bij een fout: het wachtscherm laten staan met een rode balk
        // eronder zou suggereren dat er nog iets loopt.
        if (gemaakt?.error) { setFout(gemaakt.error); setMaken(false); return; }
      } catch (e) {
        setFout(`Er liep iets mis bij het maken van je plan: ${e?.message || "onbekende fout"}. Probeer het opnieuw — is je plan half aangemaakt, dan kan je het stoppen bij "Je plan en je gegevens".`);
        setMaken(false);
        return;
      }
      // De pagina herlaadt zichzelf via revalidatePath; hier hoeft niets meer te gebeuren.
      window.location.href = "/coaching";
    });
  }

  // Tijdens het maken verdwijnt de wizard. Een knop met "bezig…" onder zeven ingevulde stappen leest
  // als "er gebeurt niets", en dan klikt iemand opnieuw.
  if (maken) return <PlanBezig stapAf={stapAf} />;

  return (
    <div className="anim-in rounded-3xl border border-borderc bg-surface p-6 sm:p-8">
      {/* Voortgang: zes stippen. Geen percentage — dat suggereert een lange weg. */}
      <div className="flex items-center gap-1.5" aria-label={`Stap ${stap} van ${LAATSTE}`}>
        {Array.from({ length: LAATSTE }).map((_, i) => (
          <span key={i} className={"h-1.5 flex-1 rounded-full transition " + (i < stap ? "bg-accent" : "bg-borderc")} />
        ))}
      </div>

      {stap === 1 && (
        <Vraag titel="Wat wil je bereiken?" uitleg="Dit bepaalt hoe je weken opgebouwd worden — zwaarder en korter, of langer en lichter.">
          <div className="space-y-2">
            {DOELEN.map((d) => (
              <button key={d.v} type="button" onClick={() => { setDoel(d.v); verder(); }} className={KNOP + (doel === d.v ? AAN : UIT)}>
                {d.l}
                <span className="mt-0.5 block text-xs font-normal text-ink/50">{d.u}</span>
              </button>
            ))}
          </div>
        </Vraag>
      )}

      {stap === 2 && (
        <Vraag titel="Waarmee wil je hulp?" uitleg="Je trainingsplan krijg je sowieso. De rest zet je aan of uit — nu of later.">
          <div className="space-y-2">
            <div className={KNOP + AAN + " cursor-default"}>
              Workouts
              <span className="mt-0.5 block text-xs font-normal text-ink/50">
                Je plan van week tot week, met je sessie in je deurcodemail. Dit is de basis en staat altijd aan.
              </span>
            </div>
            {MODULEKEUZE.map((m) => {
              const aan = modules.includes(m.v);
              return (
                <div key={m.v}>
                  <button type="button" onClick={() => setModules((l) => (aan ? l.filter((x) => x !== m.v) : [...l, m.v]))}
                    className={KNOP + (aan ? AAN : UIT)}>
                    <span className="flex items-center gap-2">
                      <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs transition " + (aan ? "border-accent bg-accent text-brand" : "border-borderc text-transparent")}>&#10003;</span>
                      {m.l}
                    </span>
                    <span className="mt-0.5 block text-xs font-normal text-ink/50">{m.u}</span>
                  </button>

                  {/* De voedingsvraag hoort bij de knop die ze oproept, niet op een eigen scherm. */}
                  {m.v === "mealplan" && aan && (
                    <div className="anim-in mt-2 rounded-2xl border-2 border-borderc p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink/45">Wat eet je niet?</p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {VOEDINGSVOORKEUREN.map((v) => {
                          const gekozen = voeding.includes(v.v);
                          return (
                            <button key={v.v} type="button"
                              onClick={() => setVoeding((l) => (gekozen ? l.filter((x) => x !== v.v) : [...l, v.v]))}
                              className={"rounded-full border-2 px-3.5 py-1.5 text-xs font-bold transition " + (gekozen ? "border-accent bg-accent/10 text-ink" : "border-borderc text-ink/60 hover:border-lav")}>
                              {v.l}
                            </button>
                          );
                        })}
                      </div>
                      <textarea rows={2} maxLength={300} value={voedingVrij} onChange={(e) => setVoedingVrij(e.target.value)}
                        placeholder="Bv. geen paprika, ik kook 's avonds voor twee"
                        className={VELD + " resize-none"} />
                      <p className="mt-1.5 text-xs leading-relaxed text-ink/45">
                        Een weekmenu heeft je gewicht, lengte en leeftijd nodig — die vraag komt straks.
                        Gaat het over een aandoening, medicatie, zwangerschap of een eetstoornis, dan maakt je
                        coach geen menu maar verwijst hij je door. Dat hoort bij een diëtist.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Vraag>
      )}

      {stap === 3 && (
        <Vraag titel="Hoe vaak train je nu al?" uitleg="Zo weten we of we bij de basis beginnen of meteen kunnen opbouwen.">
          <div className="space-y-2">
            {ERVARING.map((e) => (
              <button key={e.v} type="button" onClick={() => { setErvaring(e.v); verder(); }} className={KNOP + (ervaring === e.v ? AAN : UIT)}>
                {e.l}
                <span className="mt-0.5 block text-xs font-normal text-ink/50">{e.u}</span>
              </button>
            ))}
          </div>
        </Vraag>
      )}

      {stap === 4 && (
        <Vraag titel="Hoeveel keer per week wil je trainen?" uitleg="Je plan krijgt precies zoveel sessies per week. Liever eerlijk laag dan ambitieus hoog — je kan het altijd aanpassen.">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button key={n} type="button" onClick={() => setDagen(n)} className={"h-14 rounded-2xl border-2 font-black transition " + (dagen === n ? AAN : UIT)}>{n}</button>
            ))}
          </div>
        </Vraag>
      )}

      {stap === 5 && (
        <Vraag titel="Hoe lang mag je plan duren?" uitleg="Elke vierde week is bewust lichter. Na afloop krijg je een overzicht en kan je opnieuw beginnen.">
          <div className="grid gap-2 sm:grid-cols-3">
            {[{ n: 6, l: "6 weken", u: "Kort en concreet" }, { n: 8, l: "8 weken", u: "De gulden middenweg" }, { n: 12, l: "12 weken", u: "Echt iets opbouwen" }].map((o) => (
              <button key={o.n} type="button" onClick={() => setWeken(o.n)} className={KNOP + (weken === o.n ? AAN : UIT)}>
                {o.l}
                <span className="mt-0.5 block text-xs font-normal text-ink/50">{o.u}</span>
              </button>
            ))}
          </div>
        </Vraag>
      )}

      {stap === 6 && (
        <Vraag titel="Hoe wil je aangesproken worden?" uitleg="Dit bepaalt de toon van je wekelijkse bericht. Je kan het later wisselen.">
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setToon("rustig")} className={KNOP + (toon === "rustig" ? AAN : UIT)}>
              Hou het rustig
              <span className="mt-0.5 block text-xs font-normal text-ink/50">Bemoedigend, zonder druk.</span>
            </button>
            <button type="button" onClick={() => setToon("scherp")} className={KNOP + (toon === "scherp" ? AAN : UIT)}>
              Hou me scherp
              <span className="mt-0.5 block text-xs font-normal text-ink/50">Kort, direct, to the point.</span>
            </button>
          </div>
        </Vraag>
      )}

      {stap === 7 && (
        <Vraag
          titel="Mag je coach je lichaamsgegevens gebruiken?"
          uitleg="Met je leeftijd, gewicht en eventuele beperkingen kan je coach het schema echt op jou afstemmen. Zonder is het algemener — en dat mag ook."
        >
          {/* De toestemming is een eigen handeling, niet een vinkje onderaan een formulier. Dit zijn
              bijzondere persoonsgegevens (art. 9 AVG) en die vragen een uitdrukkelijke keuze. */}
          <div className="rounded-2xl border-2 border-borderc p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={toestemming} onChange={(e) => setToestemming(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-accent" />
              <span className="text-sm text-ink">
                <b>Ja, gebruik mijn gegevens om mijn schema af te stemmen.</b>
                <span className="mt-1 block text-xs leading-relaxed text-ink/55">
                  Je leeftijdsklasse, gewicht en wat je wil vermijden gaan mee naar het model dat je plan opstelt.
                  Je naam, e-mailadres en adres nooit. Je kan dit op elk moment intrekken bij je gegevens —
                  dan werkt je coach verder zonder die informatie.
                </span>
              </span>
            </label>
          </div>

          {toestemming && (
            <div className="anim-in mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold text-ink">
                Geboortedatum
                <input type="date" value={geboortedatum} min="1920-01-01" onChange={(e) => setGeboortedatum(e.target.value)} className={VELD} />
              </label>
              <label className="block text-sm font-bold text-ink">
                Geslacht <span className="font-normal text-ink/40">(mag je openlaten)</span>
                <span className="mt-1.5 flex gap-2">
                  {GESLACHTEN.map((g) => (
                    <button key={g} type="button" onClick={() => setGeslacht(geslacht === g ? "" : g)}
                      className={"flex-1 rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition " + (geslacht === g ? AAN : UIT)}>
                      {g}
                    </button>
                  ))}
                </span>
                <span className="mt-1 block text-xs font-normal text-ink/45">
                  Enkel gebruikt om je dagbehoefte te berekenen als je een weekmenu vraagt.
                </span>
              </label>
              <label className="block text-sm font-bold text-ink">
                Gewicht <span className="font-normal text-ink/40">(kg)</span>
                <input type="number" inputMode="decimal" step="0.1" value={gewicht} onChange={(e) => setGewicht(e.target.value)} className={VELD} />
              </label>
              <label className="block text-sm font-bold text-ink">
                Lengte <span className="font-normal text-ink/40">(cm)</span>
                <input type="number" inputMode="numeric" value={lengte} onChange={(e) => setLengte(e.target.value)} className={VELD} />
              </label>
              <label className="block text-sm font-bold text-ink sm:col-span-2">
                Iets wat we moeten vermijden? <span className="font-normal text-ink/40">(optioneel)</span>
                <textarea rows={2} maxLength={500} value={beperkingen} onChange={(e) => setBeperkingen(e.target.value)}
                  placeholder="Bv. lage rug, gevoelige knie, schouder in revalidatie"
                  className={VELD + " resize-none"} />
                <span className="mt-1 block text-xs font-normal text-ink/45">
                  Bij pijn of een blessure in behandeling verwijst je coach je door naar een echte coach — dat is geen medisch advies.
                </span>
              </label>
            </div>
          )}
        </Vraag>
      )}

      {fout && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{fout}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" onClick={terug} disabled={stap === 1 || bezig}
          className="rounded-full px-4 py-2.5 text-sm font-bold text-ink/50 transition hover:text-ink disabled:opacity-0">
          ← Terug
        </button>
        {stap < LAATSTE ? (
          <button type="button" onClick={verder}
            disabled={(stap === 1 && !doel) || (stap === 3 && !ervaring)}
            className="rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40">
            Verder
          </button>
        ) : (
          <button type="button" onClick={afronden} disabled={bezig}
            className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90 disabled:opacity-60">
            {bezig ? "Je plan wordt gemaakt…" : "Maak mijn plan"}
          </button>
        )}
      </div>

    </div>
  );
}

function Vraag({ titel, uitleg, children }) {
  return (
    <div className="anim-in mt-6">
      <h2 className="font-display text-xl font-black leading-tight text-ink sm:text-2xl">{titel}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{uitleg}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}
