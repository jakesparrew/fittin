import Link from "next/link";

export const metadata = {
  title: "De gym | Fittin'",
  description:
    "Een modern uitgeruste privégym in Gent. Reserveer de zaal voor jou en je vrienden — € 15 per sessie van 1 uur, zonder lidgeld.",
};

const memberCards = [
  {
    title: "Lid worden",
    items: [
      "Registreer je online — helemaal gratis",
      'Eerste uur gratis met de code "FittinWelcome"',
      'Ga naar online boeken en kies "Fit60"',
    ],
  },
  {
    title: "Als lid",
    items: [
      "Reserveer de gym voor € 15,00",
      "Eén sessie = 1 uur",
      "1 tot 4 personen",
      "Geen extra kosten",
    ],
  },
  {
    title: "Praktisch",
    items: [
      "Gratis parking aan de deur",
      "Aannemersstraat 186, 9040 Sint-Amandsberg",
      "Toegang via de app op het moment van je boeking",
    ],
  },
];

const prive = [
  ["Volledige privacy", "Alleen, met vrienden of met coach: de gym is van jou."],
  ["Ideaal voor beginners", "Discreet trainen zonder pottenkijkers, indien gewenst met begeleiding op maat."],
  ["Hygiënisch", "Een propere zaal en goede luchtkwaliteit, elke sessie opnieuw."],
  ["Geen wachttijden", "Alle toestellen zijn altijd beschikbaar."],
];

const loves = [
  ["We love bodyweight", "Ruimte en materiaal voor calisthenics en functioneel trainen."],
  ["We love muscles", "Deadlift-platform, rack en vrije gewichten van topkwaliteit."],
  ["We love cables", "Kabelstations voor eindeloze variatie in je training."],
];

const localBusinessLd = {
  "@context": "https://schema.org",
  "@type": "HealthClub",
  name: "Fittin'",
  description: "Privé fitness & personal training in Gent. Reserveer de zaal voor jezelf of met vrienden — € 15 per sessie van 1 uur, zonder lidgeld.",
  url: "https://fittin.be",
  email: "info@fittin.be",
  image: "https://fittin.be/opengraph-image",
  priceRange: "€€",
  address: { "@type": "PostalAddress", streetAddress: "Aannemersstraat 186", postalCode: "9040", addressLocality: "Gent", addressCountry: "BE" },
  geo: { "@type": "GeoCoordinates", latitude: 51.0686, longitude: 3.7558 },
  openingHours: "Mo-Su 00:00-24:00",
  hasMap: "https://www.google.com/maps?q=Aannemersstraat+186,+9040+Gent",
};

export default function DeGym() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }} />
      {/* Hero */}
      <section className="relative overflow-hidden bg-paper">
        <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-accent" />
        <div className="relative mx-auto max-w-6xl px-5 py-24">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Lid worden</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            Word nu lid en ontvang meteen <span className="text-accentdark">1 gratis sessie</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-brand/70">
            Gebruik de code{" "}
            <span className="rounded-full bg-brand px-3 py-1 font-bold text-accent">FittinWelcome</span>{" "}
            bij je eerste boeking.
          </p>
          <Link
            href="/boeken"
            className="mt-8 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90"
          >
            Word Fittin&rsquo; member
          </Link>
        </div>
      </section>

      {/* Member info */}
      <section>
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-20 md:grid-cols-3">
          {memberCards.map((card) => (
            <div key={card.title} className="rounded-2xl border border-borderc bg-white p-7">
              <h2 className="text-xl font-black">{card.title}</h2>
              <ul className="mt-4 space-y-3">
                {card.items.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-brand/70">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Prive gymmen */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Privé gymmen</p>
          <h2 className="mt-3 max-w-xl text-3xl font-black md:text-4xl">
            Reserveer de zaal voor jou en je vrienden
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {prive.map(([title, text]) => (
              <div key={title} className="flex gap-4 rounded-2xl bg-white p-6">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-accent" />
                <div>
                  <h3 className="font-black">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-brand/60">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coach quote */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="relative overflow-hidden rounded-3xl bg-brand p-10 text-white md:p-14">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent" />
            <p className="relative max-w-2xl text-2xl font-black leading-snug md:text-3xl">
              &ldquo;De ideale springplank voor coaches die de investering nog niet willen
              maken&rdquo;
            </p>
            <p className="relative mt-4 max-w-xl text-lav">
              Ben je zelf coach en op zoek naar een zaal? Boek een afspraak en kom eens langs.
            </p>
            <a
              href="mailto:fit@fittin.be?subject=Zaal%20huren%20als%20coach"
              className="relative mt-7 inline-block rounded-full bg-accent px-6 py-3 font-bold text-brand transition hover:opacity-90"
            >
              Kom eens langs
            </a>
          </div>
        </div>
      </section>

      {/* We love */}
      <section className="pb-20">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 md:grid-cols-3">
          {loves.map(([title, text]) => (
            <div key={title} className="rounded-2xl border border-borderc p-7">
              <div className="h-2.5 w-10 rounded-full bg-accent" />
              <h3 className="mt-4 text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-brand/60">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="bg-paper">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">What about Fittin&rsquo;</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">Persoonlijk en doelgericht</h2>
          <p className="mt-5 leading-relaxed text-brand/70">
            Fittin&rsquo; is een project van De Wereld Draait Door, vereniging zonder winstoogmerk.
            Anders dan de hedendaagse gymketens hanteren wij geen lidgeld of abonnementskosten. We
            vinden het belangrijk een toegankelijk tarief te bieden: je betaalt enkel voor de tijd
            waarin je gebruik maakt van onze gym, met of zonder coach.
          </p>
        </div>
      </section>

      {/* Locatie & bereikbaarheid */}
      <section className="pb-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="overflow-hidden rounded-3xl border border-borderc bg-white md:grid md:grid-cols-[1fr_1.3fr]">
            <div className="p-8 md:p-10">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Vind ons</p>
              <h2 className="mt-2 text-3xl font-black text-brand">In het hart van Gent</h2>
              <p className="mt-4 leading-relaxed text-brand/70">Onze privégym ligt vlot bereikbaar met gratis parking aan de deur.</p>
              <dl className="mt-6 space-y-3 text-sm">
                <div><dt className="font-bold text-brand">Adres</dt><dd className="text-brand/70">Aannemersstraat 186, 9040 Gent</dd></div>
                <div><dt className="font-bold text-brand">Parking</dt><dd className="text-brand/70">Gratis parking aan de deur</dd></div>
                <div><dt className="font-bold text-brand">Contact</dt><dd><a href="mailto:info@fittin.be" className="text-accentdark hover:underline">info@fittin.be</a></dd></div>
              </dl>
              <a href="https://www.google.com/maps/dir/?api=1&destination=Aannemersstraat+186,+9040+Gent" target="_blank" rel="noreferrer" className="mt-6 inline-block rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Routebeschrijving →</a>
            </div>
            <div className="min-h-[320px]">
              <iframe
                title="Fittin' op de kaart"
                src="https://www.google.com/maps?q=Aannemersstraat%20186%2C%209040%20Gent&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: "320px" }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
