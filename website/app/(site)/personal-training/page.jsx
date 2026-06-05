import Link from "next/link";

export const metadata = {
  title: "Personal training | Fittin'",
  description:
    "Personal training op maat in Gent. Gratis intake en proeftraining. 1-op-1 € 60, 1-op-2 € 35 pp, 1-op-3 € 30 pp.",
};

const expect = [
  {
    title: "Jouw eerste sessie",
    items: ["Intakegesprek + proeftraining", "Korte evaluatie", "Volledig gratis"],
  },
  {
    title: "Een sessie",
    items: [
      "Duurt 60 minuten",
      "Kostprijs afhankelijk van het programma",
      "Kosteloos annuleerbaar tot 24u op voorhand",
    ],
  },
  {
    title: "Programma's",
    items: ["1 on 1 — € 60", "1 on 2 — € 35 pp", "1 on 3 — € 30 pp"],
  },
];

const coaches = [
  {
    name: "Yoshe Willems",
    tagline: "Op zelfstandige wijze verantwoord leren fitnessen",
    days: "Di · Do · Za · Zo",
    email: "willemsyoshe@gmail.com",
    phone: "+32 483 53 42 44",
    specials: ["Krachttraining", "Vetverlies", "Conditietraining", "Zelfstandig leren fitnessen", "HIIT"],
  },
  {
    name: "Jelle Vercruysse",
    tagline: "Functioneel bewegen op maat",
    days: "Ma · Di · Wo · Do · Za · Zo",
    email: "coachgent.pt@gmail.com",
    phone: "+32 474 31 61 01",
    specials: ["Functioneel trainen", "Sportspecifiek trainen", "Explosieve kracht", "HIIT", "Kracht & hypertrofie"],
  },
  {
    name: "Billy Den Haese",
    tagline: "Movement and lifestyle",
    days: "Wo · Do · Vr · Za",
    email: "denhaesebilly@gmail.com",
    phone: "+32 492 78 76 72",
    specials: ["Bokstraining", "Bodyweight training", "Functional training", "Krachttraining", "Small group training"],
  },
];

export default function PersonalTraining() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-32 -top-32 h-72 w-72 rounded-full bg-accent" />
        <div className="relative mx-auto max-w-6xl px-5 py-24">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Feel good</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            De kracht van <span className="text-accentdark">positieve verandering</span>
          </h1>
          <div className="mt-6 max-w-2xl space-y-4 leading-relaxed text-brand/70">
            <p>
              Als je doet wat goed is voor je lichaam, voel je je goed. Misschien heb je al eerder
              geprobeerd je levensstijl om te gooien en was dat te veel en te zwaar. Een personal
              coach begeleidt je geleidelijk naar jouw doel.
            </p>
            <p>
              Dit gaat niet over een loodzwaar trainingsprogramma. Dit gaat over een kleine
              verandering met veel resultaat: voor jezelf zorgen en begrijpen wat je lichaam nodig
              heeft om zich optimaal te voelen.
            </p>
          </div>
        </div>
      </section>

      {/* Quote banner */}
      <section className="bg-accent">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="max-w-3xl text-2xl font-black leading-snug text-brand md:text-3xl">
            &ldquo;Ontdek het fitnessprogramma waarbij je je zo goed voelt, dat je het met plezier
            doet&rdquo;
          </p>
          <a
            href="mailto:fit@fittin.be?subject=Gratis%20proeftraining"
            className="mt-7 inline-block rounded-full bg-brand px-7 py-3.5 font-bold text-white transition hover:opacity-90"
          >
            Gratis proeftraining
          </a>
        </div>
      </section>

      {/* Wat kan je verwachten */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Praktisch</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">Wat kan je verwachten</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-brand/70">
            Individuele en kwalitatieve sportbegeleiding op maat is ons motto. Altijd positief
            ingesteld om net dat tikkeltje verder te gaan.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {expect.map((card) => (
              <div key={card.title} className="rounded-2xl bg-white p-7">
                <h3 className="text-lg font-black">{card.title}</h3>
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
        </div>
      </section>

      {/* Coaches */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Onze coaches</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">
            Misschien binnenkort jouw sportbuddy
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {coaches.map((coach) => (
              <div key={coach.name} className="flex flex-col rounded-2xl border border-borderc p-7">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-black text-accent">
                  {coach.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <h3 className="mt-4 text-xl font-black">{coach.name}</h3>
                <p className="mt-1 text-sm font-semibold text-accentdark">{coach.tagline}</p>
                <p className="mt-3 text-sm text-brand/60">Beschikbaar: {coach.days}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {coach.specials.map((s) => (
                    <span key={s} className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-brand/70">
                      {s}
                    </span>
                  ))}
                </div>
                <div className="mt-auto space-y-1 pt-5 text-sm">
                  <a href={"mailto:" + coach.email + "?subject=Personal training"} className="block font-semibold text-brand transition hover:text-accentdark">
                    {coach.email}
                  </a>
                  <a href={"tel:" + coach.phone.replace(/\s/g, "")} className="block font-semibold text-brand transition hover:text-accentdark">
                    {coach.phone}
                  </a>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 rounded-3xl bg-paper p-8 text-center">
            <p className="font-semibold text-brand/70">
              Klaar om te starten? Je eerste sessie (intake + proeftraining) is volledig gratis.
            </p>
            <Link
              href="/boeken"
              className="mt-5 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90"
            >
              Boek je proeftraining
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
