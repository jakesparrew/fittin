import Link from "next/link";
import Reveal from "@/components/anim/Reveal";
import Counter from "@/components/anim/Counter";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

export const metadata = {
  title: "Fittin' — privégym & personal training in Gent",
  description: "Reserveer de hele zaal voor jezelf, je vrienden of met een coach. Elke dag van 6u tot 23u in Gent, geen lidgeld — je betaalt enkel voor je tijd.",
  alternates: { canonical: SITE },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "HealthClub",
  name: "Fittin'",
  description: "Privé fitness & personal training in Gent. Reserveer de zaal voor jezelf of train met een coach. Elke dag van 6u tot 23u.",
  url: "https://fittin.be",
  email: "info@fittin.be",
  image: "https://fittin.be/opengraph-image",
  priceRange: "€€",
  address: { "@type": "PostalAddress", streetAddress: "Aannemersstraat 186", addressLocality: "Gent", postalCode: "9040", addressCountry: "BE" },
  geo: { "@type": "GeoCoordinates", latitude: 51.0686, longitude: 3.7558 },
  sameAs: ["https://www.instagram.com/fittin_gent/", "https://www.facebook.com/fittingent"],
  openingHours: "Mo-Su 06:00-23:00",
};

const usps = [
  ["Volledige privacy", "Alleen, met vrienden of met coach — de zaal is helemaal van jou.", "lock"],
  ["Elke dag 6–23u", "Train wanneer het jou uitkomt — de app opent de deur tijdens je sessie.", "clock"],
  ["Geen wachttijden", "Alle toestellen zijn altijd vrij. Jij bent de enige groep.", "bolt"],
  ["Geen lidgeld", "Je betaalt enkel voor de tijd dat je traint. Zo simpel is het.", "euro"],
];

const steps = [
  ["Maak je gratis account", "In 30 seconden geregeld — met e-mail of met Google. Geen lidgeld, geen verplichtingen.", "01"],
  ["Boek je eerste uur — gratis", "Reserveer een moment dat jou past en gebruik de code FittinWelcome voor je eerste gratis sessie.", "02"],
  ["Open de deur & train", "Je boeking opent de deur via de app. De hele zaal voor jou — alleen, met vrienden of met coach.", "03"],
];

// Homepage "alles in één app" feature showcase.
const appFeatures = [
  { title: "Kant-en-klare workouts", icon: "dumbbell", desc: "Follow-along programma's zoals Borst, Schouders en Rug: per oefening een bewegende demo, je sets, reps en rust. Druk op start en volg mee." },
  { title: "Rusttimer & voortgang", icon: "chart", desc: "De rusttimer telt voor je af en je voortgang per oefening wordt bijgehouden. Jij focust op de set, de app houdt de rest bij." },
  { title: "~800 oefeningen met demo's", icon: "book", desc: "Een volledige oefeningenbibliotheek met bewegende demo-beelden, de juiste spieren en heldere uitleg. Altijd perfecte techniek." },
  { title: "Eigen plannen + AI-generator", icon: "ai", desc: "Stel je eigen workout-plannen samen, of laat de AI-generator in enkele tikken een schema op maat opzetten voor jouw doel." },
  { title: "Training loggen met PR's", icon: "list", desc: "Log je sets en gewicht, krijg een melding bij elk nieuw persoonlijk record en volg je progressie week na week." },
  { title: "Community & leaderboard", icon: "trophy", desc: "Klim in de ranking, doe mee aan challenges en events, train met je buddies en volg de activiteitenfeed." },
  { title: "Persoonlijke coaching", icon: "coach", desc: "Je coach bouwt je programma in de app — jij volgt het onder 'Training', je coach volgt jouw opvolging op. Begeleiding op maat." },
  { title: "Slimme toegang & boeken", icon: "key", desc: "Boek elke dag van 6 tot 23u de hele zaal privé. Je toegangscode komt automatisch ± 5 min vooraf en de deur opent via de app." },
];

export default function Home() {
  return (
    <main className="overflow-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ============ HERO ============ */}
      <section className="relative isolate overflow-hidden bg-brand text-white">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster="/video-poster.jpg"
        >
          <source src="/video.webm" type="video/webm" />
          <source src="/video.mp4" type="video/mp4" />
        </video>
        {/* Semi-transparent dark + brand overlay so the video shows through but text stays legible */}
        <div className="absolute inset-0 bg-brand/65" />
        <div className="brand-mesh absolute inset-0 opacity-40 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand/80 via-brand/20 to-brand/40" />
        <div className="animate-floaty pointer-events-none absolute -left-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-accent/25 blur-2xl" />
        <div className="animate-floaty-slow pointer-events-none absolute -bottom-40 -right-24 h-[32rem] w-[32rem] rounded-full bg-lav/20 blur-2xl" />

        <div className="relative mx-auto max-w-6xl px-5 py-28 md:py-36">
          <Reveal>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-accent">Get Fittin&rsquo; · Gent</p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.98] tracking-tight md:text-7xl">
              Train in jouw eigen{" "}
              <span className="relative whitespace-nowrap text-accent">
                privégym
                <svg className="absolute -bottom-2 left-0 w-full" height="12" viewBox="0 0 300 12" fill="none" preserveAspectRatio="none">
                  <path d="M2 9C60 3 240 3 298 9" stroke="#5FDA6B" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/70 md:text-xl">
              Een modern uitgeruste zaal, exclusief voor jou. Reserveer per uur, open de deur met de
              app en train wanneer het jou past — alleen, met je coach of met je vrienden.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/login?mode=signup" className="shine rounded-full bg-accent px-8 py-4 text-lg font-black text-brand shadow-lg shadow-accent/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent/40">
                Maak gratis account
              </Link>
              <Link href="/boeken" className="rounded-full border-2 border-white/30 px-8 py-4 text-lg font-bold text-white backdrop-blur transition hover:border-white hover:bg-white/10">
                Reserveer de gym
              </Link>
            </div>
            <p className="mt-4 text-sm font-semibold text-white/60">
              Je eerste uur is <span className="font-black text-accent">gratis</span> met de code <span className="font-black text-white">FittinWelcome</span> · geen lidgeld, geen verplichtingen.
            </p>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-3 text-sm font-bold text-white/60">
              {["€ 15 per sessie", "1 uur per sessie", "1 tot 4 personen", "elke dag 6–23u", "geen lidgeld"].map((t, i) => (
                <span key={t} className="flex items-center gap-3">
                  {i > 0 && <span className="h-1 w-1 rounded-full bg-accent" />}
                  <span className="rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">{t}</span>
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        <svg className="relative block w-full" viewBox="0 0 1440 80" fill="none" preserveAspectRatio="none">
          <path d="M0 80V20C240 60 480 0 720 20C960 40 1200 70 1440 30V80H0Z" fill="white" />
        </svg>
      </section>

      {/* ============ MARQUEE ============ */}
      <div className="border-y border-borderc bg-white py-4">
        <div
          className="flex overflow-hidden"
          style={{ maskImage: "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)" }}
        >
          <div className="marquee-track flex shrink-0 items-center gap-8 whitespace-nowrap pr-8 text-lg font-black uppercase tracking-wide text-brand/30 md:text-xl">
            {[...Array(2)].map((_, k) => (
              <span key={k} className="flex items-center gap-8">
                {["Privé", "7 dagen op 7", "Geen lidgeld", "Personal coaching", "Open de deur met de app", "Train met vrienden", "In Gent"].map((w) => (
                  <span key={w} className="flex items-center gap-8">
                    {w} <span className="inline-block h-1.5 w-1.5 rotate-45 bg-accent align-middle" />
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ============ STATS ============ */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Fittin&rsquo; in cijfers</p>
            <h2 className="mt-2 max-w-xl text-2xl font-black text-brand md:text-3xl">Geen poespas. Gewoon de zaal — wanneer jij wil.</h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-8 overflow-hidden rounded-[2rem] border border-borderc">
              <div className="h-1.5 w-full bg-accent" />
              <div className="grid grid-cols-2 gap-px bg-borderc lg:grid-cols-4">
                {[
                  { v: 24, s: "/7", l: "Open, elke dag" },
                  { v: 15, p: "€ ", l: "Per sessie van 1 uur" },
                  { v: 4, p: "1–", l: "Personen per boeking" },
                  { v: 0, l: "Verplicht abonnement" },
                ].map((stat, i) => (
                  <div key={i} className="group bg-white p-8 transition-colors hover:bg-paper lg:p-10">
                    <p className="font-display text-5xl font-black leading-none text-brand md:text-6xl">
                      {stat.p && <span className="text-accentdark">{stat.p}</span>}
                      <Counter to={stat.v} />
                      {stat.s && <span className="text-accentdark">{stat.s}</span>}
                    </p>
                    <p className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand/45">
                      <span className="inline-block h-1.5 w-1.5 rotate-45 bg-accent transition group-hover:scale-150" />
                      {stat.l}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ USPs ============ */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <Reveal>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Privé gymmen</p>
            <h2 className="mt-3 max-w-2xl text-4xl font-black leading-tight md:text-5xl">
              De zaal is van jou. <span className="text-accentdark">En van niemand anders.</span>
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {usps.map(([title, text, icon], i) => (
              <Reveal key={title} delay={i * 90}>
                <div className="group h-full rounded-3xl border border-borderc bg-white p-7 transition hover:-translate-y-1.5 hover:shadow-xl hover:shadow-brand/5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accentdark transition group-hover:bg-accent group-hover:text-brand">
                    <Icon name={icon} />
                  </div>
                  <h3 className="mt-5 text-lg font-black">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-brand/60">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="relative overflow-hidden bg-brand text-white">
        <div className="animate-floaty-slow pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full bg-accent/20 blur-2xl" />
        <div className="relative mx-auto max-w-6xl px-5 py-24">
          <Reveal>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-accent">Zo begin je</p>
            <h2 className="mt-3 max-w-2xl text-4xl font-black leading-tight md:text-5xl">
              Van account tot trainen in <span className="text-accent">3 stappen</span>
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {steps.map(([title, text, num], i) => (
              <Reveal key={num} delay={i * 120}>
                <div className="relative h-full rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur transition hover:border-accent/40 hover:bg-white/[0.08]">
                  <span className="text-5xl font-black text-accent/30">{num}</span>
                  <h3 className="mt-4 text-xl font-black">{title}</h3>
                  <p className="mt-2 leading-relaxed text-white/60">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={120}>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Link href="/login?mode=signup" className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-4 text-lg font-black text-brand transition hover:-translate-y-0.5 hover:opacity-90">
                Maak gratis account <span aria-hidden>→</span>
              </Link>
              <Link href="/personal-training" className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-7 py-4 font-bold text-white transition hover:border-white hover:bg-white/10">
                Liever met coach? Gratis proeftraining
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ COACHING ============ */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 lg:grid-cols-2">
          <Reveal>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Get coached</p>
            <h2 className="mt-3 text-4xl font-black leading-tight md:text-5xl">
              Een coach die jou écht vooruit helpt
            </h2>
            <p className="mt-5 max-w-lg leading-relaxed text-brand/70">
              Haal het beste uit jezelf met een duwtje in de rug. Onze gecertificeerde coaches werken
              datagedreven: een schema op maat, opvolging en consistente progressie — één-op-één, voor
              koppels of met vrienden.
            </p>
            <Link href="/personal-training" className="mt-8 inline-block rounded-full bg-brand px-7 py-3.5 font-bold text-white transition hover:-translate-y-0.5 hover:opacity-90">
              Ontmoet onze coaches
            </Link>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Personal coaching", "Gecertificeerde coaches die doelgericht te werk gaan."],
              ["Training op maat", "Schema's op maat met data-opname tijdens je sessie."],
              ["Voor koppels & vrienden", "Train samen — één-op-één, 1-op-2 of 1-op-3."],
              ["Gratis intake", "Je eerste sessie is een gratis intake + proeftraining."],
            ].map(([t, d], i) => (
              <Reveal key={t} delay={i * 80} className="h-full">
                <div className="h-full rounded-3xl bg-paper p-6 transition hover:-translate-y-1 hover:shadow-lg hover:shadow-brand/5">
                  <div className="h-2.5 w-10 rounded-full bg-accent" />
                  <h3 className="mt-4 font-black">{t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-brand/60">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ ALLES IN ÉÉN APP ============ */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Alles in één app</p>
              <h2 className="mt-3 text-4xl font-black leading-tight md:text-5xl">
                Boeken, trainen én opvolgen — <span className="text-accentdark">alles op fittin.be</span>
              </h2>
              <p className="mt-4 leading-relaxed text-brand/60">
                Fittin&rsquo; is meer dan een privézaal die je per uur reserveert. In je account zit een complete
                trainingsapp: kant-en-klare workouts met demo&rsquo;s en rusttimer, ~800 oefeningen, je eigen plannen
                of een AI-generator, training loggen met PR&rsquo;s, een community met leaderboard én je coaching.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/workouts" className="rounded-full bg-brand px-7 py-3.5 font-bold text-white transition hover:-translate-y-0.5 hover:opacity-90">Ontdek de workouts →</Link>
                <Link href="/login?mode=signup" className="rounded-full border-2 border-borderc px-7 py-3.5 font-bold text-brand transition hover:border-accent">Maak gratis account</Link>
              </div>
              <p className="mt-4 text-sm font-semibold text-brand/50">Eén login, alles erin — van je gratis eerste sessie tot je honderdste PR.</p>
            </Reveal>
            <Reveal delay={120}>
              <PhoneMockup />
            </Reveal>
          </div>
          <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {appFeatures.map((f, i) => (
              <Reveal key={f.title} delay={i * 70}>
                <div className="group h-full rounded-3xl border border-borderc bg-paper p-6 transition hover:-translate-y-1.5 hover:bg-white hover:shadow-xl hover:shadow-brand/5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accentdark transition group-hover:bg-accent group-hover:text-brand">
                    <FeatureIcon name={f.icon} />
                  </div>
                  <h3 className="mt-5 font-black text-brand">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-brand/60">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRICING TEASER ============ */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <Reveal>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Eerlijk & simpel</p>
            <h2 className="mt-3 text-4xl font-black md:text-5xl">Betaal enkel voor je tijd</h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { name: "Losse sessie", price: "€ 15", per: "/ sessie", items: ["1 uur in de zaal", "1 tot 4 personen", "Geen verplichting"], cta: "Boek nu", href: "/boeken", hot: false },
              { name: "10-beurtenkaart", price: "€ 150", per: "/ 11 sessies", items: ["10 + 1 gratis sessie", "6 maanden geldig", "Tot 3 vrienden mee"], cta: "Koop kaart", href: "/lidmaatschap", hot: false },
              { name: "Member-abonnement", price: "€ 12", per: "/ maand", items: ["1 sessie / maand inbegrepen", "Alle sessies aan € 12", "Maandelijks opzegbaar"], cta: "Word member", href: "/lidmaatschap", hot: true },
              { name: "Personal training", price: "Op aanvraag", per: "", items: ["1-op-1, duo of trio", "Schema & opvolging op maat", "Gratis intake + proeftraining"], cta: "Ontdek coaching", href: "/personal-training", hot: false },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 90} className="h-full">
                <div className={"relative flex h-full flex-col rounded-3xl border p-8 transition hover:-translate-y-1.5 " + (p.hot ? "border-accent bg-brand text-white shadow-xl shadow-brand/20" : "border-borderc bg-white hover:shadow-xl hover:shadow-brand/5")}>
                  {p.hot && <span className="absolute -top-3 left-8 rounded-full bg-accent px-3 py-1 text-xs font-black text-brand">Beste prijs / sessie</span>}
                  <p className={"text-xs font-black uppercase tracking-widest " + (p.hot ? "text-accent" : "text-lav")}>{p.name}</p>
                  <p className="mt-3 text-4xl font-black">{p.price}<span className={"text-base font-bold " + (p.hot ? "text-white/50" : "text-brand/40")}> {p.per}</span></p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm">
                    {p.items.map((it) => (
                      <li key={it} className="flex items-center gap-3">
                        <span className="text-accent">✓</span>
                        <span className={p.hot ? "text-white/80" : "text-brand/70"}>{it}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={p.href} className={"mt-7 rounded-full py-3 text-center font-bold transition hover:opacity-90 " + (p.hot ? "bg-accent text-brand" : "bg-brand text-white")}>{p.cta}</Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="relative overflow-hidden bg-brand text-white">
        <div className="brand-mesh absolute inset-0 opacity-60" />
        <div className="animate-floaty pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/40 blur-2xl" />
        <div className="relative mx-auto max-w-4xl px-5 py-28 text-center">
          <Reveal>
            <h2 className="text-4xl font-black leading-tight md:text-6xl">
              Je eerste uur is <span className="text-accent">gratis</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">
              Word Fittin&rsquo; member en gebruik de code{" "}
              <span className="rounded-full bg-white/10 px-3 py-1 font-black text-accent ring-1 ring-accent/30">FittinWelcome</span>{" "}
              bij je eerste online boeking.
            </p>
            <Link href="/boeken" className="shine mt-10 inline-block rounded-full bg-accent px-10 py-4 text-lg font-black text-brand shadow-lg shadow-accent/30 transition hover:-translate-y-0.5 hover:shadow-xl">
              Boek je gratis sessie
            </Link>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

function Icon({ name }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "lock") return <svg {...common}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "bolt") return <svg {...common}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>;
  return <svg {...common}><path d="M18 7c-1.5-1.5-4-2-6-2-4 0-7 2-7 5s3 4 7 4c4 0 7 1 7 4s-3 5-7 5c-2 0-4.5-.5-6-2" /><path d="M12 2v20" /></svg>;
}

function FeatureIcon({ name }) {
  const c = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  const P = {
    dumbbell: "M4 7v10M8 5v14M16 5v14M20 7v10M8 12h8",
    chart: "M3 3v18h18M19 9l-5 5-3-3-4 4",
    book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z",
    ai: "M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    trophy: "M8 21h8M12 17v4M6 4h12v5a6 6 0 0 1-12 0zM6 4H3v2a3 3 0 0 0 3 3M18 4h3v2a3 3 0 0 1-3 3",
    coach: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M3 21a6 6 0 0 1 12 0M16 3.2a4 4 0 0 1 0 7.6M21 21a6 6 0 0 0-5-5.8",
    key: "M21 2l-9.5 9.5M15.5 7.5l3 3M11.5 11.5a4.5 4.5 0 1 1-6.36 6.36 4.5 4.5 0 0 1 6.36-6.36z",
  };
  return <svg {...c}><path d={P[name] || P.list} /></svg>;
}

function PhoneMockup() {
  const tab = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  const rows = [
    { name: "Bench press", sets: "4 × 8", done: true },
    { name: "Barbell row", sets: "4 × 10", done: true },
    { name: "Schouderpers", sets: "3 × 12", done: false },
  ];
  return (
    <div className="relative mx-auto w-[270px] select-none">
      {/* glow */}
      <div className="absolute -inset-8 -z-10 rounded-[3.5rem] bg-accent/20 blur-3xl" />
      <div className="absolute -right-6 top-10 -z-10 h-40 w-40 rounded-full bg-accent/30 blur-2xl" />
      {/* device */}
      <div className="relative rounded-[2.8rem] border-[11px] border-brand bg-brand shadow-2xl shadow-brand/30">
        {/* notch */}
        <div className="absolute left-1/2 top-0 z-20 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-brand" />
        {/* screen */}
        <div className="relative overflow-hidden rounded-[2.1rem] bg-paper">
          {/* header */}
          <div className="bg-brand px-5 pb-6 pt-4 text-white">
            <div className="flex items-center justify-between text-[10px] font-bold text-white/50">
              <span>9:41</span>
              <span className="tracking-wide">fittin&rsquo;</span>
            </div>
            <p className="mt-4 text-xs text-white/55">Welkom terug, Yoshe</p>
            <p className="text-xl font-black leading-tight">Klaar om te trainen?</p>
          </div>
          {/* body */}
          <div className="-mt-3 space-y-3 rounded-t-3xl bg-paper px-4 pb-3 pt-4">
            {/* featured workout */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm shadow-brand/5">
              <div className="relative flex h-20 items-start justify-between bg-gradient-to-br from-accentdark to-accent p-3">
                <span className="rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-black text-brand">VANDAAG</span>
                <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[9px] font-black text-white">45 min</span>
              </div>
              <div className="p-3">
                <p className="text-sm font-black text-brand">Full Body — Kracht</p>
                <p className="text-[10px] font-semibold text-brand/45">8 oefeningen · push / pull / legs</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-borderc">
                    <div className="h-1.5 w-2/3 rounded-full bg-accent" />
                  </div>
                  <span className="text-[9px] font-black text-accentdark">66%</span>
                </div>
              </div>
            </div>
            {/* exercise rows */}
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.name} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm shadow-brand/5">
                  <span className={"flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black " + (r.done ? "bg-accent text-brand" : "border-2 border-borderc text-brand/30")}>{r.done ? "✓" : ""}</span>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-brand">{r.name}</p>
                    <p className="text-[9px] font-semibold text-brand/40">{r.sets}</p>
                  </div>
                  <span className="text-brand/20">›</span>
                </div>
              ))}
            </div>
          </div>
          {/* bottom tab bar */}
          <div className="flex items-center justify-around border-t border-borderc bg-white px-2 py-2.5">
            {[
              { d: "M3 11l9-8 9 8M5 10v10h14V10", active: false },
              { d: "M4 7v10M8 5v14M16 5v14M20 7v10M8 12h8", active: true },
              { d: "M3 3v18h18M19 9l-5 5-3-3-4 4", active: false },
              { d: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M3 21a6 6 0 0 1 12 0", active: false },
            ].map((t, i) => (
              <span key={i} className={t.active ? "text-accentdark" : "text-brand/25"}>
                <svg {...tab}><path d={t.d} /></svg>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
