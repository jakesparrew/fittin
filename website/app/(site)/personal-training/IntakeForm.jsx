"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { requestIntake } from "./actions";
import { DAGDELEN, DAGEN, FORMULES } from "./options";
import { track } from "@/lib/track";

// Zelfde selectie-idioom als de boekingsflow (BookingClient): accentrand + accent/10 = gekozen,
// borderc + hover:border-lav = niet gekozen. Het zijn ECHTE radio's en vinkjes onder `peer sr-only`,
// geen <button>-chips. Drie redenen: (1) new FormData(e.currentTarget) pikt ze vanzelf op, dus geen
// verborgen inputs; (2) een <button> in een <form> is standaard type="submit", dus één vergeten
// attribuut en een tik op "donderdag" verstuurt het formulier; (3) tab + spatie en de
// schermlezer-aankondiging werken gratis.
//
// Drie details die een review eruit haalde en die je niet ziet door alleen te klikken:
// · `peer-checked:hover:border-accent` moet erbij. Zonder die regel wint `hover:border-lav` van
//   `peer-checked:border-accent` — gelijke specificiteit, en Tailwind zet hover later in de laag.
//   Gevolg: net na je klik, met de cursor nog op de chip, sprong de rand terug naar grijs.
// · focus krijgt een RING, niet dezelfde rand als "gekozen". Anders valt de toetsenbordfocus samen
//   met de selectie en verandert er niets zichtbaars als je met de pijltjes door de groep gaat.
// · `text-ink-soft` i.p.v. `text-brand/55`: dat laatste haalt 3,7:1 op wit en zakt onder AA voor
//   vette 12px-tekst. globals.css wijst ink-soft hier zelf voor aan.
// · `flex h-full items-center justify-center` i.p.v. `block`: de chips staan in een grid, dus een
//   label dat wél wikkelt maakt zijn buren niet mee hoger — dan stond er één chip van 58px naast
//   twee van 41px. Met h-full vullen ze de rijhoogte en blijft de tekst gecentreerd.
const CHIP =
  "flex h-full cursor-pointer select-none items-center justify-center rounded-xl border-2 border-borderc bg-white text-center font-bold " +
  "text-ink-soft transition hover:border-lav peer-checked:border-accent peer-checked:bg-accent/10 " +
  "peer-checked:text-brand peer-checked:hover:border-accent " +
  "peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2";

// De enige conversieroute van personal training. Zelfde patroon als hulp/HelpForm.jsx: een eigen
// client-formulier in plaats van ActionForm, want een toast van enkele seconden is te weinig
// bevestiging voor een aanvraag die pas dagen later beantwoord wordt.
export default function IntakeForm({ coaches = [] }) {
  const [pending, start] = useTransition();
  const [klaar, setKlaar] = useState(null);
  const [fout, setFout] = useState(null);
  const [coachId, setCoachId] = useState("");
  // Beide keuzes zitten in state. Bij de dagen moet dat, anders kan "Elke dag" de zeven vinkjes
  // niet in één tik zetten; bij het dagdeel moet het omdat een native radio niet uitgezet kan
  // worden en de "Wis"-knop dat wél moet kunnen. Leeg initialiseren, nooit uit iets
  // browser-specifieks — anders krijg je op deze statisch geprerenderde pagina dezelfde
  // hydratatie-mismatch als eerder uit de klok. Bij een serverfout resetten we bewust niet: het
  // formulier blijft staan, dus de selectie hoort er nog te zijn.
  const [dagen, setDagen] = useState([]);
  const [dagdeel, setDagdeel] = useState("");
  const alleDagen = dagen.length === DAGEN.length;
  const formRef = useRef(null);

  // ?coach=<slug> komt van de coachpagina's. We lezen hem in de browser i.p.v. via searchParams,
  // zodat de pagina zelf statisch geprerenderd kan blijven.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("coach");
    if (!wanted) return;
    const hit = coaches.find((c) => c.slug === wanted || c.id === wanted);
    if (hit) setCoachId(hit.id);
  }, [coaches]);

  // Herstelde vinkjes uit de DOM overnemen, eenmalig na hydratatie.
  //
  // Waarom dit moet: React zet tijdens hydratatie bewust niet `element.checked` uit de props, maar
  // bij élke volgende render wél. Vinkt iemand Ma en Di aan en herlaadt hij de pagina, dan zet de
  // browser die vinkjes terug — zichtbaar aan, want de CSS volgt de DOM — terwijl `dagen` leeg is.
  // De eerstvolgende klik zou Ma en Di er dan geruisloos weer afgooien, en op de aangeklikte chip
  // zelf zou je twee keer moeten tikken. Door hier één keer te lezen wat er écht staat, klopt de
  // state weer met het scherm. Draait ná hydratatie, dus het raakt de statische prerender niet.
  useEffect(() => {
    const f = formRef.current;
    if (!f) return;
    const herstelde = [...f.querySelectorAll("input[name=dagen]:checked")].map((i) => i.value);
    if (herstelde.length) setDagen(herstelde);
    const dd = f.querySelector("input[name=dagdeel]:checked");
    if (dd) setDagdeel(dd.value);
  }, []);

  const verstuur = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await requestIntake(fd);
      if (r?.error) { setFout(r.error); setKlaar(null); }
      else {
        // Het hoofddoel van de hele PT-tak, en tot nu ongemeten: intake_requested stond op de
        // whitelist van /api/pv maar werd nergens afgevuurd. `already` (honeypot-bot of derde
        // aanvraag binnen het venster) telt niet mee — daar vertrekt ook geen mail.
        if (!r?.already) track("intake_requested");
        setKlaar({ msg: r?.message || "Aanvraag verstuurd ✓", already: !!r?.already }); setFout(null);
      }
    });
  };

  if (klaar) {
    return (
      <div className="mt-10 rounded-3xl border-2 border-accent bg-accent/10 p-8 text-center">
        <p className="text-xl font-black text-brand">Aanvraag verstuurd 🙌</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-brand/70">
          {klaar.msg}{" "}
          {!klaar.already && "Je krijgt meteen een bevestigingsmail; we mailen je binnen 1 werkdag om een moment te prikken. "}
          Hoor je niets? Mail{" "}
          <a href="mailto:info@fittin.be" className="font-bold text-accentdark hover:underline">info@fittin.be</a>.
        </p>
      </div>
    );
  }

  const gekozenCoach = coaches.find((c) => c.id === coachId);

  return (
    // method="post" is bijvangst uit dezelfde review: zonder JavaScript deed de verzendknop een
    // native GET, waarna naam, e-mail en doel in de URL en dus in de browsergeschiedenis en de
    // Referer-header van de volgende klik belandden. Verzenden werkt zonder JS sowieso niet — maar
    // de gegevens horen dan ook niet in de adresbalk te staan.
    <form ref={formRef} method="post" onSubmit={verstuur} className="mt-10 rounded-3xl border border-borderc bg-white p-6 md:p-8">
      {/* Honeypot — verborgen voor mensen, ingevuld door bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {coaches.length < 2 && <input type="hidden" name="coachId" value={coachId} />}

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
          Telefoon <span className="font-normal text-brand/40">(optioneel)</span>
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" className="mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
        <label className="block text-sm font-bold text-brand">
          Formule
          <select name="formule" defaultValue="Weet ik nog niet" className="mt-1.5 w-full rounded-xl border-2 border-borderc bg-white px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent">
            {FORMULES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>

        {coaches.length >= 2 && (
          <label className="block text-sm font-bold text-brand sm:col-span-2">
            Voorkeurcoach <span className="font-normal text-brand/40">(optioneel)</span>
            <select name="coachId" value={coachId} onChange={(e) => setCoachId(e.target.value)} className="mt-1.5 w-full rounded-xl border-2 border-borderc bg-white px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent">
              <option value="">Geen voorkeur — kies samen tijdens de intake</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        {/* Vraag 1: dagdeel. Precies één antwoord, dus radio's. `sm:col-span-2` is verplicht — de
            grid is sm:grid-cols-2 en zonder dit wordt de rij een halve kolom breed.
            Drie gelijke kolommen i.p.v. flex-wrap: bij wrappen viel de derde chip op elk toestel
            tot 412px als weesje op een tweede rij, wat het blok onnodig hoger maakte.
            De "Wis"-knop bestaat omdat een native radio niet uitgezet kan worden. De vraag heet
            "(optioneel)", en met de pijltjestoetsen kiés je al terwijl je alleen wil rondkijken —
            zonder uitweg zit je daar dan aan vast, en die waarde belandt in het mailonderwerp. */}
        <div className="sm:col-span-2" role="radiogroup" aria-labelledby="lbl-dagdeel">
          <div className="flex items-baseline justify-between gap-3">
            <p id="lbl-dagdeel" className="text-sm font-bold text-brand">
              Wanneer kan je meestal? <span className="font-normal text-ink-soft">(optioneel)</span>
            </p>
            {dagdeel && (
              <button
                type="button"
                onClick={() => setDagdeel("")}
                className="-my-1 shrink-0 rounded-full px-2.5 py-1.5 text-xs font-bold text-accentdark transition hover:underline"
              >
                Wis
              </button>
            )}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {DAGDELEN.map((d) => (
              <label key={d.v}>
                <input
                  type="radio"
                  name="dagdeel"
                  value={d.v}
                  checked={dagdeel === d.v}
                  onChange={() => setDagdeel(d.v)}
                  className="peer sr-only"
                />
                {/* Op 320px past "'s Avonds" niet in een derde van de rij op 14px; vandaar text-xs
                    tot aan sm, gelijk aan de dagchips eronder. */}
                <span className={CHIP + " px-1 py-2.5 text-xs leading-tight sm:px-2 sm:text-sm"}>{d.l}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Vraag 2: dagen. Meerdere antwoorden, dus vinkjes met dezelfde `name` — de server leest ze
            met getAll("dagen"). "Elke dag" staat op de labelregel i.p.v. als eigen knoprij: dat
            scheelt hoogte op een formulier waar elke pixel scrollwerk is. Twee van de vier echte
            aanvragen waren "elke dag"/"flexibel", dus zonder die knop zou dit formulier voor hen
            trager zijn dan typen. type="button" is hier niet optioneel — zonder dat attribuut
            verstuurt hij het formulier. */}
        <div className="sm:col-span-2" role="group" aria-labelledby="lbl-dagen">
          <div className="flex items-baseline justify-between gap-3">
            <p id="lbl-dagen" className="text-sm font-bold text-brand">
              Welke dagen? <span className="font-normal text-ink-soft">(optioneel)</span>
            </p>
            <button
              type="button"
              onClick={() => setDagen(alleDagen ? [] : DAGEN.map((d) => d.v))}
              className="-my-1 shrink-0 rounded-full px-2.5 py-1.5 text-xs font-bold text-accentdark transition hover:underline"
            >
              {alleDagen ? "Wis alles" : "Elke dag"}
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1.5">
            {DAGEN.map((d) => (
              <label key={d.v}>
                <input
                  type="checkbox"
                  name="dagen"
                  value={d.v}
                  checked={dagen.includes(d.v)}
                  onChange={() => setDagen((v) => (v.includes(d.v) ? v.filter((x) => x !== d.v) : [...v, d.v]))}
                  className="peer sr-only"
                />
                <span className={CHIP + " py-3 text-xs"}>{d.l}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Het vrije veld blijft. Van de vier echte antwoorden past "Werkdagen na 17 uur, weekend na
            10 uur" in geen enkel chipmodel dat minder dan veertien tikken kost. Schrappen zou één op
            vier antwoorden armer maken; laten staan kost niets, want het veld is al gevalideerd.
            Het stond hier eerst zonder label, met enkel een placeholder als uitleg — maar die
            verdwijnt bij de eerste toetsaanslag, en dan staat er een bak tekst zonder vraag erboven.
            Nu een gewoon label, zoals elk ander veld hier. */}
        <label className="block text-sm font-bold text-brand sm:col-span-2">
          Iets specifieker? <span className="font-normal text-ink-soft">(optioneel)</span>
          <input
            name="when"
            maxLength={200}
            placeholder="Bv. na 18u, of enkel om de week"
            className="mt-1.5 w-full rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent"
          />
        </label>

        <label className="block text-sm font-bold text-brand sm:col-span-2">
          Wat is je doel? <span className="font-normal text-brand/40">(optioneel)</span>
          <textarea name="goal" rows={4} maxLength={2000} placeholder="Bv. sterker worden, afvallen, terug in conditie komen…" className="mt-1.5 w-full resize-none rounded-xl border-2 border-borderc px-3.5 py-2.5 text-sm font-normal text-brand outline-none transition focus:border-accent" />
        </label>
      </div>

      {coaches.length < 2 && gekozenCoach && (
        <p className="mt-4 text-sm font-semibold text-brand/70">Je aanvraag gaat naar {gekozenCoach.name}.</p>
      )}
      {fout && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{fout}</p>}

      <button disabled={pending} className="mt-6 w-full rounded-full bg-accent py-4 text-lg font-black text-brand transition hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-10">
        {pending ? "Versturen…" : "Vraag gratis intake aan"}
      </button>
      <p className="mt-3 text-xs text-brand/40">
        We gebruiken je gegevens enkel om je intake in te plannen — zie ons{" "}
        <Link href="/privacy" className="font-semibold text-accentdark hover:underline">privacybeleid</Link>.
      </p>
    </form>
  );
}
