import Link from "next/link";

const usps = [
  ["Volledige privacy", "Alleen, met vrienden of met coach: de gym is van jou."],
  ["Ideaal voor beginners", "Discreet trainen zonder pottenkijkers, met begeleiding op maat als je wil."],
  ["Geen wachttijden", "Alle toestellen zijn altijd beschikbaar — jij bent de enige groep."],
  ["Geen lidgeld", "Je betaalt enkel voor de tijd waarin je de gym gebruikt."],
];

const coached = [
  ["Personal coaching", "Fittin' werkt met gecertificeerde personal coaches die doelgericht te werk gaan."],
  ["Training op maat", "Snelle progressie via data-opname tijdens de sessies, schema's op maat en consistente opvolging."],
  ["Fittin' programs", "Eén-op-één, Fittin' voor koppels of Fittin' voor vrienden — er is altijd een formule die past."],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "HealthClub",
  name: "Fittin'",
  description:
    "Privé fitness & personal training in Gent. Reserveer de zaal voor jezelf of train met een coach.",
  url: "https://fittin.be",
  telephone: "",
  priceRange: "€€",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Aannemersstraat 186",
    addressLocality: "Gent",
    postalCode: "9040",
    addressCountry: "BE",
  },
  sameAs: [
    "https://www.instagram.com/fittin_gent/",
    "https://www.facebook.com/fittingent",
  ],
  openingHours: "Mo-Su 07:00-21:00",
};

export default function Home() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-36 -top-36 h-80 w-80 rounded-full bg-accent" />
        <div className="pointer-events-none absolute -bottom-44 -right-28 h-96 w-96 rounded-full bg-lav/40" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 md:py-32">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Get Fittin&rsquo;</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
            Personal training &amp; privé sporten in onze{" "}
            <span className="text-accentdark">exclusieve gym</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-brand/70">
            Fittin&rsquo; is een modern uitgeruste sportzaal voor privégebruik. Train samen met je
            personal trainer of reserveer de fitness voor jezelf (en vrienden).
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link
              href="/boeken"
              className="rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90"
            >
              Reserveer de gym
            </Link>
            <Link
              href="/personal-training"
              className="rounded-full border-2 border-brand px-7 py-3.5 font-bold text-brand transition hover:bg-brand hover:text-white"
            >
              Gratis proeftraining
            </Link>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-brand/60">
            <span>€ 11 per sessie</span>
            <span className="text-accent">·</span>
            <span>1u15 per sessie</span>
            <span className="text-accent">·</span>
            <span>1 tot 4 personen</span>
            <span className="text-accent">·</span>
            <span>geen lidgeld</span>
          </div>
        </div>
      </section>

      {/* USP's */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Privé gymmen</p>
          <h2 className="mt-3 max-w-xl text-3xl font-black md:text-4xl">
            De zaal is van jou, en van niemand anders
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {usps.map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-borderc bg-white p-6">
                <div className="h-2.5 w-10 rounded-full bg-accent" />
                <h3 className="mt-4 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand/60">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Get coached */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Get coached</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-black md:text-4xl">
            Boek een gratis proeftraining bij jouw coach
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-brand/70">
            Haal het beste uit jezelf met een duwtje in de rug. Fit worden vraagt discipline,
            motivatie en consistentie — daarom zijn wij er.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {coached.map(([title, text]) => (
              <div key={title} className="rounded-2xl bg-paper p-7">
                <h3 className="text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand/60">{text}</p>
              </div>
            ))}
          </div>
          <Link
            href="/personal-training"
            className="mt-9 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90"
          >
            Ontmoet onze coaches
          </Link>
        </div>
      </section>

      {/* Pricing band */}
      <section className="relative overflow-hidden bg-brand text-white">
        <div className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-accent" />
        <div className="relative mx-auto max-w-6xl px-5 py-20">
          <h2 className="max-w-2xl text-3xl font-black md:text-4xl">
            Eerste keer? Je eerste uur is <span className="text-accent">gratis</span>
          </h2>
          <p className="mt-4 max-w-xl leading-relaxed text-lav">
            Word Fittin&rsquo; member en gebruik de code{" "}
            <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-accent">
              FittinWelcome
            </span>{" "}
            bij je eerste online boeking.
          </p>
          <Link
            href="/boeken"
            className="mt-8 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90"
          >
            Boek je gratis sessie
          </Link>
        </div>
      </section>
    </main>
  );
}
