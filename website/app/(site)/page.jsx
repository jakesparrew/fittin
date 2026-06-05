import Link from "next/link";
import Reveal from "@/components/anim/Reveal";
import Counter from "@/components/anim/Counter";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "HealthClub",
  name: "Fittin'",
  description: "Privé fitness & personal training in Gent. Reserveer de zaal voor jezelf of train met een coach. 24/7 open.",
  url: "https://fittin.be",
  priceRange: "€€",
  address: { "@type": "PostalAddress", streetAddress: "Aannemersstraat 186", addressLocality: "Gent", postalCode: "9040", addressCountry: "BE" },
  sameAs: ["https://www.instagram.com/fittin_gent/", "https://www.facebook.com/fittingent"],
  openingHours: "Mo-Su 00:00-24:00",
};

const usps = [
  ["Volledige privacy", "Alleen, met vrienden of met coach — de zaal is helemaal van jou.", "lock"],
  ["24/7 open", "Train wanneer het jou uitkomt. De app opent de deur tijdens je sessie.", "clock"],
  ["Geen wachttijden", "Alle toestellen zijn altijd vrij. Jij bent de enige groep.", "bolt"],
  ["Geen lidgeld", "Je betaalt enkel voor de tijd dat je traint. Zo simpel is het.", "euro"],
];

const steps = [
  ["Boek je moment", "Reserveer in enkele tikken — alleen of met vrienden, dag en nacht.", "01"],
  ["Open de deur", "Je boeking opent de deur via de app. Geen sleutel, geen personeel.", "02"],
  ["Train op jouw manier", "De hele zaal voor jou. Met je coach of helemaal zelfstandig.", "03"],
];

export default function Home() {
  return (
    <main className="overflow-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ============ HERO ============ */}
      <section className="relative isolate overflow-hidden bg-brand text-white">
        <div className="brand-mesh absolute inset-0 opacity-90" />
        <div className="animate-floaty pointer-events-none absolute -left-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-accent/40 blur-2xl" />
        <div className="animate-floaty-slow pointer-events-none absolute -bottom-40 -right-24 h-[32rem] w-[32rem] rounded-full bg-lav/30 blur-2xl" />

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
              app en train 24/7 — met je personal coach of helemaal alleen.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/boeken" className="shine rounded-full bg-accent px-8 py-4 text-lg font-black text-brand shadow-lg shadow-accent/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent/40">
                Reserveer de gym
              </Link>
              <Link href="/personal-training" className="rounded-full border-2 border-white/30 px-8 py-4 text-lg font-bold text-white backdrop-blur transition hover:border-white hover:bg-white/10">
                Gratis proeftraining
              </Link>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-3 text-sm font-bold text-white/60">
              {["€ 11 per sessie", "1u15 per sessie", "1 tot 4 personen", "24/7 open", "geen lidgeld"].map((t, i) => (
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
      <div className="border-y border-borderc bg-white py-5">
        <div className="flex overflow-hidden">
          <div className="marquee-track flex shrink-0 items-center gap-10 whitespace-nowrap pr-10 text-2xl font-black uppercase tracking-tight text-brand/15 md:text-3xl">
            {[...Array(2)].map((_, k) => (
              <span key={k} className="flex items-center gap-10">
                {["Privé", "24/7", "Geen lidgeld", "Personal coaching", "Open de deur met de app", "Train met vrienden", "In Gent"].map((w) => (
                  <span key={w} className="flex items-center gap-10">
                    {w} <span className="text-accent">✦</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ============ STATS ============ */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { v: 24, s: "/7", l: "Open, elke dag" },
            { v: 11, p: "€ ", l: "Per sessie van 1u15" },
            { v: 4, p: "1–", l: "Personen per boeking" },
            { v: 0, l: "Lidgeld of abonnement" },
          ].map((stat, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="rounded-3xl border border-borderc bg-paper p-7 text-center transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10">
                <p className="text-5xl font-black text-brand">
                  <Counter to={stat.v} prefix={stat.p || ""} suffix={stat.s || ""} />
                </p>
                <p className="mt-2 text-sm font-bold text-brand/50">{stat.l}</p>
              </div>
            </Reveal>
          ))}
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
            <p className="text-sm font-black uppercase tracking-[0.25em] text-accent">Zo werkt het</p>
            <h2 className="mt-3 max-w-2xl text-4xl font-black leading-tight md:text-5xl">
              De gym die <span className="text-accent">zichzelf opent</span>
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
            <Link href="/boeken" className="mt-12 inline-flex items-center gap-2 rounded-full bg-accent px-8 py-4 text-lg font-black text-brand transition hover:-translate-y-0.5 hover:opacity-90">
              Start nu <span aria-hidden>→</span>
            </Link>
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

      {/* ============ PRICING TEASER ============ */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <Reveal>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Eerlijk & simpel</p>
            <h2 className="mt-3 text-4xl font-black md:text-5xl">Betaal enkel voor je tijd</h2>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { name: "Losse sessie", price: "€ 11", per: "/ sessie", items: ["1u15 in de zaal", "1 tot 4 personen", "Geen verplichting"], cta: "Boek nu", href: "/boeken", hot: false },
              { name: "10-beurtenkaart", price: "€ 100", per: "/ 10 sessies", items: ["€ 10 per sessie", "6 maanden geldig", "Deel met vrienden"], cta: "Koop sessies", href: "/lidmaatschap", hot: true },
              { name: "Personal training", price: "€ 60", per: "/ sessie 1-op-1", items: ["1-op-2 € 35 pp", "1-op-3 € 30 pp", "Gratis intake"], cta: "Ontdek coaching", href: "/personal-training", hot: false },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 90} className="h-full">
                <div className={"relative flex h-full flex-col rounded-3xl border p-8 transition hover:-translate-y-1.5 " + (p.hot ? "border-accent bg-brand text-white shadow-xl shadow-brand/20" : "border-borderc bg-white hover:shadow-xl hover:shadow-brand/5")}>
                  {p.hot && <span className="absolute -top-3 left-8 rounded-full bg-accent px-3 py-1 text-xs font-black text-brand">Populairst</span>}
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
