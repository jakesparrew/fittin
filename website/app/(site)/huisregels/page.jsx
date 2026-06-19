import Link from "next/link";

export const metadata = {
  title: "Toegang & huisregels | Fittin'",
  description:
    "Zo kom je binnen in de privégym in Gent: je toegangscode komt 5 minuten voor je sessie binnen. Plus de huisregels en hoe je de zaal netjes achterlaat.",
};

const entrySteps = [
  ["Boek je sessie", "Reserveer een uur in de app. Je betaalt meteen — daarna staat de zaal volledig voor jou (en wie je meebrengt)."],
  ["Ontvang je toegangscode", "± 5 minuten voor je sessie start krijg je een e-mail met je persoonlijke toegangscode, het adres en een knop ‘Navigeer naar de gym’."],
  ["Kom binnen", "Toets de code in op het paneel naast de voordeur, of open de deur met de knop in je account. De toegang werkt enkel tijdens jouw tijdslot."],
  ["Sluit goed af", "Trek de deur achter je dicht — zeker als je als laatste vertrekt. De zaal is privé, dus laat niemand binnen die niet bij jouw boeking hoort."],
];

const houseRules = [
  ["Respecteer je tijdslot", "Kom op tijd en rond af binnen je uur — net na jou kan iemand anders geboekt hebben. Loop je uit, hou er rekening mee dat de toegang stopt na je slot."],
  ["Enkel wie geboekt is", "De gym is privé per sessie. Breng alleen mensen mee die in je boeking staan (max. het aantal personen dat je koos). Niemand anders binnenlaten."],
  ["Propere schoenen", "Trek binnen aparte, propere sportschoenen aan. Geen modderige buitenschoenen op de vloer of toestellen."],
  ["Hou het rustig & respectvol", "Hou de muziek op een redelijk niveau en ga respectvol om met het materiaal en de ruimte. Behandel de zaal zoals je ze zelf wil aantreffen."],
  ["Geen eten op de toestellen", "Drinken in een afsluitbare fles is prima. Eten en open dranken hou je weg van de toestellen."],
  ["Meld een defect", "Werkt er iets niet, of is er iets stuk of vuil bij aankomst? Laat het ons weten via info@fittin.be — dan lossen we het snel op."],
];

const cleanup = [
  "Veeg elk toestel dat je gebruikte schoon (spray en doekjes staan klaar).",
  "Leg gewichten, dumbbells en materiaal terug op hun vaste plaats.",
  "Gooi afval in de vuilnisbak en neem je handdoek en spullen weer mee.",
  "Doe de lichten uit en controleer of de deur volledig dicht is voor je vertrekt.",
];

export default function HuisregelsPage() {
  return (
    <main className="bg-paper">
      {/* Hero */}
      <section className="bg-brand px-5 py-16 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-bold uppercase tracking-widest text-accent">Privégym · Gent</p>
          <h1 className="mt-2 text-4xl font-black sm:text-5xl">Toegang &amp; huisregels</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">
            Bij Fittin' train je in een privézaal, helemaal voor jezelf. Hier lees je precies hoe je
            binnenraakt, welke afspraken er gelden en hoe je de zaal netjes achterlaat voor de volgende.
          </p>
        </div>
      </section>

      {/* Entry */}
      <section className="mx-auto max-w-4xl px-5 py-14">
        <h2 className="text-2xl font-black text-brand">Zo kom je binnen 🔑</h2>
        <p className="mt-2 max-w-2xl text-brand/60">
          Je hebt geen badge of sleutel nodig. Je toegang komt automatisch naar je toe, vlak voor je sessie.
        </p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {entrySteps.map(([title, body], i) => (
            <li key={title} className="rounded-3xl border border-borderc bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-black text-brand">{i + 1}</span>
              <p className="mt-4 font-black text-brand">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-brand/65">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 rounded-3xl border-2 border-accent/40 bg-accent/5 p-6">
          <p className="font-bold text-brand">📩 Je toegangscode komt ± 5 minuten voor je sessie per e-mail.</p>
          <p className="mt-1 text-sm text-brand/65">
            In die mail vind je de code, het adres en een knop om meteen naar de gym te navigeren. Kan je toch
            niet? Je kan je sessie tot <b>6 uur</b> voor de start verplaatsen in je account.
          </p>
        </div>
      </section>

      {/* House rules */}
      <section className="mx-auto max-w-4xl px-5 pb-14">
        <h2 className="text-2xl font-black text-brand">Huisregels</h2>
        <p className="mt-2 max-w-2xl text-brand/60">Een paar simpele afspraken houden de zaal voor iedereen top.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {houseRules.map(([title, body]) => (
            <div key={title} className="rounded-3xl border border-borderc bg-white p-6">
              <p className="font-black text-brand">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-brand/65">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cleanup */}
      <section className="mx-auto max-w-4xl px-5 pb-20">
        <div className="rounded-3xl bg-brand p-8 text-white">
          <h2 className="text-2xl font-black">Laat de zaal netjes achter 🧼</h2>
          <p className="mt-2 text-white/75">
            De gym is onbemand tijdens je sessie. Laat ze achter zoals je ze zelf graag aantreft —
            de volgende sporter (en wijzelf) zijn je dankbaar.
          </p>
          <ul className="mt-6 space-y-3">
            {cleanup.map((c) => (
              <li key={c} className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-black text-brand">✓</span>
                <span className="text-white/90">{c}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/boeken" className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Boek je sessie</Link>
            <a href="mailto:info@fittin.be" className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10">Iets melden? info@fittin.be</a>
          </div>
        </div>
      </section>
    </main>
  );
}
