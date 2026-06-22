import Link from "next/link";
import { getGymCached, getPublicCoachesCached } from "@/lib/cache";
import { coachSlug } from "@/lib/slug";

export const metadata = {
  title: "Personal training in Gent | Fittin'",
  description:
    "Personal coaching bij Fittin' in Gent: gratis intake, een plan op maat in onze app en wekelijkse opvolging door je coach. Train privé in onze zaal. Prijs op aanvraag — start met een gratis proeftraining.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/personal-training` },
};

const valueProps = [
  {
    title: "Een coach die jou écht volgt",
    text: "Geen standaardschema's. Je coach leert je doel, niveau en agenda kennen en bouwt daarrond. Tussen de sessies door volgt hij of zij je voortgang op in de app.",
    icon: "heart",
  },
  {
    title: "Je programma leeft in de app",
    text: "Je coach bouwt je trainingsprogramma rechtstreeks in de Fittin'-app. Jij vindt het terug onder \"Training\" — met bewegende demo's, sets, reps en rust. Niets om te onthouden.",
    icon: "app",
  },
  {
    title: "Privé trainen, op jouw tempo",
    text: "Elke sessie heb je de hele zaal voor jezelf. Geen pottenkijkers, geen wachtrij aan de toestellen. Ideaal als beginner én als ervaren sporter.",
    icon: "target",
  },
];

const coaching = [
  {
    title: "Je coach bouwt je plan in de app",
    text: "Op basis van je intake stelt je coach een programma op maat samen in de Fittin'-app: de juiste oefeningen, het juiste volume, de juiste progressie. Aangepast wanneer dat nodig is.",
    icon: "plan",
  },
  {
    title: "Jij traint mee onder \"Training\"",
    text: "Open de app en je sessie staat klaar. Per oefening zie je een bewegende demo, de betrokken spieren, je sets en reps en een rusttimer. Je logt je gewicht en de app detecteert je PR's.",
    icon: "app",
  },
  {
    title: "Je coach volgt je opvolging op",
    text: "Alles wat je logt komt bij je coach terecht. Zo ziet hij of zij hoe consistent je traint, waar je vooruitgaat en waar het schema moet bijgestuurd worden — ook tussen twee sessies door.",
    icon: "chart",
  },
];

const steps = [
  {
    title: "1. Gratis intake & proeftraining",
    text: "We starten met een kennismaking en een echte proeftraining. Samen leggen we je doel vast en kijken we welke coach en aanpak bij jou passen. Volledig gratis en vrijblijvend.",
  },
  {
    title: "2. Jouw plan op maat",
    text: "Je coach vertaalt je doel naar een concreet programma en bouwt dat in de Fittin'-app. Vanaf dag één weet je precies wat je traint en waarom.",
  },
  {
    title: "3. Trainen met begeleiding",
    text: "Tijdens je sessies krijg je 1-op-1 begeleiding op techniek, tempo en intensiteit. Tussen de sessies door train je verder met je plan in de app, op je eigen ritme.",
  },
  {
    title: "4. Opvolging & bijsturen",
    text: "Je coach volgt je logging en voortgang op en stuurt je programma bij waar nodig. Zo blijf je vooruitgaan, week na week.",
  },
];

const appPoints = [
  "Je volledige programma onder \"Training\", klaar om te starten",
  "~800 oefeningen met bewegende demo's, spieren en uitleg",
  "Logging van sets en gewicht met automatische PR-detectie",
  "Je voortgang per week, zichtbaar voor jou én je coach",
];

const formules = [
  { name: "1-op-1", desc: "Volledig privé. Alle aandacht en begeleiding gaat naar jou." },
  { name: "1-op-2 (duo)", desc: "Samen met een partner of vriend(in). Motiverend en gezellig." },
  { name: "1-op-3 (small group)", desc: "Met je kleine vaste groepje. Begeleiding op maat, samen sterker." },
];

const faq = [
  {
    q: "Wat kost personal training bij Fittin'?",
    a: "De prijs van personal training is op aanvraag — ze hangt af van je doel, de gekozen coach en of je 1-op-1, in duo of in kleine groep traint. Tijdens je gratis intake bespreek je dit rechtstreeks met je coach, zonder verplichting.",
  },
  {
    q: "Is de proeftraining echt gratis?",
    a: "Ja. Je eerste sessie — een intakegesprek én een echte proeftraining — is volledig gratis en vrijblijvend. Zo weet je meteen of de aanpak en de coach bij je passen.",
  },
  {
    q: "Moet ik lid worden of een abonnement nemen?",
    a: "Nee. Bij Fittin' betaal je enkel voor je tijd, er is geen lidgeld. Voor personal training spreek je af met je coach; voor losse sessies in de zaal reserveer je gewoon per uur.",
  },
  {
    q: "Hoe werkt het programma in de app?",
    a: "Je coach bouwt je trainingsprogramma rechtstreeks in de Fittin'-app. Jij vindt het terug onder \"Training\", met per oefening een bewegende demo, je sets, reps en rust. Je logt je training en je coach volgt je voortgang en adherence op.",
  },
  {
    q: "Voor wie is personal training geschikt?",
    a: "Voor iedereen — van absolute beginner tot ervaren sporter. Of je nu sterker wil worden, vet wil verliezen, conditie wil opbouwen of sportspecifiek wil trainen: je coach stemt alles af op jouw niveau en doel.",
  },
  {
    q: "Kan ik samen met een vriend trainen?",
    a: "Zeker. Naast 1-op-1 kan je ook in duo (1-op-2) of in een kleine groep (1-op-3) trainen. Je hebt telkens de hele zaal exclusief voor jullie.",
  },
];

const Icon = ({ name }) => {
  const common = { className: "h-6 w-6", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24" };
  const paths = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />,
    app: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    plan: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
    chart: <><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" /></>,
    check: <path d="M20 6 9 17l-5-5" />,
  };
  return <svg {...common}>{paths[name] || paths.check}</svg>;
};

export default async function PersonalTraining() {
  const gym = await getGymCached();
  const coaches = gym ? await getPublicCoachesCached(gym.id) : [];
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-32 -top-32 h-72 w-72 rounded-full bg-accent" />
        <div className="relative mx-auto max-w-6xl px-5 py-24">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Personal coaching</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            Een coach die je begeleidt — <span className="text-accentdark">in de zaal én in de app</span>
          </h1>
          <div className="mt-6 max-w-2xl space-y-4 text-lg leading-relaxed text-brand/70">
            <p>
              Bij Fittin&rsquo; train je nooit op een eilandje. Je coach leert jou en je doel kennen,
              bouwt je programma op maat in onze app en volgt je voortgang van dichtbij op. Jij hoeft
              alleen maar op te dagen en te trainen.
            </p>
            <p>
              We starten altijd met een <strong className="text-brand">gratis intake en proeftraining</strong>.
              Zo voel je meteen of de aanpak bij je past — zonder enige verplichting.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/boeken"
              className="inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90"
            >
              Boek je gratis proeftraining
            </Link>
            <a
              href="#coaches"
              className="inline-block rounded-full border border-borderc px-7 py-3.5 font-bold text-brand transition hover:bg-paper"
            >
              Maak kennis met de coaches
            </a>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Waarom coaching bij Fittin&rsquo;</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-black md:text-4xl">
            Begeleiding die niet stopt na je sessie
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {valueProps.map((card) => (
              <div key={card.title} className="rounded-2xl bg-white p-7">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-accent">
                  <Icon name={card.icon} />
                </div>
                <h3 className="mt-5 text-lg font-black">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand/60">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coaching in de app — het unieke verhaal */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Coaching + app</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-black md:text-4xl">
            Jouw coach en de app werken samen
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-brand/70">
            Dit is wat coaching bij Fittin&rsquo; uniek maakt: je programma woont in dezelfde app waarin je
            traint. Geen losse papieren schema&rsquo;s, geen gokwerk — alles op één plek, voor jou en je coach.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {coaching.map((card, i) => (
              <div key={card.title} className="relative flex flex-col rounded-2xl border border-borderc p-7">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-brand">
                  <Icon name={card.icon} />
                </div>
                <h3 className="mt-5 text-lg font-black">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand/60">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Proces */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Hoe het werkt</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">Van eerste gesprek tot blijvende vooruitgang</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step.title} className="rounded-2xl bg-white p-7">
                <h3 className="text-lg font-black text-brand">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand/60">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App tie-in */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="relative overflow-hidden rounded-3xl bg-brand p-10 text-white md:p-14">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent" />
            <div className="relative max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-accent">In de app</p>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">Alles wat je nodig hebt onder &ldquo;Training&rdquo;</h2>
              <p className="mt-4 leading-relaxed text-lav">
                Je coach zet je programma klaar in de Fittin&rsquo;-app. Jij opent het tabblad &ldquo;Training&rdquo;
                en gaat aan de slag — met demo&rsquo;s, logging en voortgang die je coach mee opvolgt.
              </p>
              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {appPoints.map((p) => (
                  <li key={p} className="flex gap-3 text-sm leading-relaxed text-white/90">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-brand">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Coaches */}
      <section id="coaches" className="bg-paper scroll-mt-24">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Onze coaches</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">
            Misschien binnenkort jouw sportbuddy
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-brand/70">
            Onze ervaren coaches, elk met hun eigen specialiteit. Tijdens je gratis intake ontdek je
            wie het best bij jou en je doel past.
          </p>
          {coaches.length > 0 ? (
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {coaches.map((coach) => (
                <Link key={coach.id} href={`/coaches/${coachSlug(coach)}`} className="flex flex-col rounded-2xl border border-borderc bg-white p-7 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5">
                  {coach.coach_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coach.coach_photo_url} alt={coach.full_name || "Coach"} className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-black text-accent">
                      {(coach.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                  )}
                  <h3 className="mt-4 text-xl font-black">{coach.full_name || "Coach"}</h3>
                  {coach.coach_specialty && <p className="mt-1 text-sm font-semibold text-accentdark">{coach.coach_specialty}</p>}
                  <span className="mt-auto pt-5 text-sm font-bold text-brand">Bekijk profiel →</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-10 rounded-2xl border border-dashed border-borderc bg-white p-8 text-center text-brand/50">Onze coaches worden binnenkort voorgesteld.</p>
          )}
        </div>
      </section>

      {/* Formules */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Formules</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">Alleen, met een buddy of in groep</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-brand/70">
            Je kiest zelf hoe je traint. Elke formule krijgt dezelfde persoonlijke begeleiding en
            hetzelfde plan op maat in de app.{" "}
            <span className="font-semibold text-brand">De prijs is op aanvraag</span> — je bespreekt ze
            tijdens je gratis intake.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {formules.map((f) => (
              <div key={f.name} className="rounded-2xl border border-borderc p-7">
                <div className="h-2.5 w-10 rounded-full bg-accent" />
                <h3 className="mt-4 text-xl font-black">{f.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand/60">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl bg-paper p-6 text-sm leading-relaxed text-brand/70">
            <strong className="text-brand">Prijs op aanvraag.</strong> Personal training is altijd op maat,
            dus de prijs ook. Je krijgt een helder voorstel tijdens je gratis intake — zonder verplichting.
Je sessie verplaatsen kan tot 6u op voorhand, in overleg met je coach.
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-paper">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Veelgestelde vragen</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">Goed om te weten</h2>
          <div className="mt-10 space-y-4">
            {faq.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-borderc bg-white p-6">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-black text-brand marker:content-none">
                  {item.q}
                  <span className="shrink-0 text-accentdark transition group-open:rotate-45">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-brand/70">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="relative overflow-hidden rounded-3xl bg-accent p-10 text-center md:p-16">
            <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-white/30" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-black text-brand md:text-4xl">
                Klaar om te starten? Je eerste sessie is gratis.
              </h2>
              <p className="mt-4 leading-relaxed text-brand/80">
                Intake én proeftraining, volledig gratis en vrijblijvend. Je ontdekt meteen hoe het voelt
                om met een coach te trainen — en wat een plan op maat in de app voor jou kan doen.
              </p>
              <Link
                href="/boeken"
                className="mt-8 inline-block rounded-full bg-brand px-8 py-4 font-bold text-white transition hover:opacity-90"
              >
                Boek je gratis proeftraining
              </Link>
              <p className="mt-4 text-sm font-semibold text-brand/70">
                Liever eerst overleggen? Mail{" "}
                <a href="mailto:info@fittin.be?subject=Personal%20training" className="underline">info@fittin.be</a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
