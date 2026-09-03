import Image from "next/image";
import CoachApplyForm from "./CoachApplyForm";

export const metadata = {
  title: "Word coach bij Fittin' | Personal trainer in Gent",
  description:
    "Bouw je eigen PT-praktijk in een volledig uitgeruste privézaal in Gent. Geen huurcontract, geen vaste kosten — je betaalt € 12 per sessie voor je eigen klanten, € 18 voor een klant die wij aanbrengen, en je houdt je eigen tarief.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/coach-worden` },
};

// De landingsplek van de wervingsmail "Fittin' zoekt coaches". Zelfde opbouw als
// /personal-training: pitch → hoe het werkt → formulier. Bewust kort — wie hier belandt is al
// geïnteresseerd, de conversie zit in het formulier onderaan.
const voordelen = [
  {
    titel: "De hele zaal voor jou en je klant",
    tekst: "Tijdens jouw sessie is de gym volledig privé. Geen wachtrij aan het rek, geen andere leden op de achtergrond — jouw klant krijgt jouw volle aandacht in een rustige, volledig uitgeruste zaal.",
  },
  {
    titel: "Geen huurcontract, geen vaste kosten",
    tekst: "Je betaalt € 12 per sessie van 1 uur met je eigen klanten, enkel wanneer je effectief traint. Geen maandelijkse huur, geen minimumafname, geen opzegtermijn. Brengt Fittin' jou een klant aan, dan kost een sessie met die klant € 18 — dat aanvaard je vooraf, per klant, nooit stilzwijgend. Je tarief naar je klant bepaal je volledig zelf.",
  },
  {
    titel: "Jouw praktijk draait in onze app",
    tekst: "Je plant sessies, bouwt trainingsprogramma's met video-demo's, volgt de voortgang van je klanten en communiceert met hen — allemaal op één plek. De deur opent automatisch tijdens je sessie.",
  },
];

const stappen = [
  ["1. Meld je aan", "Vul het formulier hieronder in. We nemen binnen enkele dagen contact op."],
  ["2. Kennismaking", "We drinken een koffie in de zaal, tonen je alles en overlopen hoe het werkt — vrijblijvend, voor allebei."],
  ["3. Start met je klanten", "Je krijgt een coach-account, zet je beschikbaarheid en profiel op en boekt je eerste sessie. Wij sturen geïnteresseerde leden mee jouw richting uit — zo'n klant kost je niets tot je hem aanvaardt, en daarna enkel € 18 voor de sessies die je effectief met hem traint."],
];

export default function CoachWorden() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-32 -top-32 h-72 w-72 rounded-full bg-accent" />
        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:py-24">
          <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Fittin&rsquo; zoekt coaches</p>
              <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight sm:text-4xl md:text-5xl">
                Jouw PT-praktijk, <span className="text-accentdark">zonder eigen zaal te moeten huren</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-brand/70 sm:mt-6 sm:text-lg">
                Train je klanten in een volledig uitgeruste privégym in Gent (Sint-Amandsberg).
                Je betaalt enkel per sessie, houdt je eigen tarief en je eigen klanten — en onze app
                regelt de planning, de programma&rsquo;s en de toegang.
              </p>
              <a href="#aanmelden" className="mt-6 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90 sm:mt-8">
                Meld je aan als coach
              </a>
            </div>
            <Image
              src="/video-poster.jpg"
              alt="De trainingszaal van Fittin' in Gent"
              width={1280}
              height={720}
              sizes="340px"
              className="hidden aspect-[4/3] w-full rounded-3xl border border-borderc object-cover md:block"
            />
          </div>
        </div>
      </section>

      {/* Voordelen */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Waarom coachen bij Fittin&rsquo;</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-black md:text-4xl">Alles van een eigen zaal, zonder de kosten</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {voordelen.map((v) => (
              <div key={v.titel} className="rounded-2xl bg-white p-7">
                <h3 className="text-lg font-black">{v.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand/60">{v.tekst}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hoe het werkt + formulier */}
      <section id="aanmelden">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Hoe het werkt</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">In drie stappen aan de slag</h2>
          <div className="mt-8 grid gap-4">
            {stappen.map(([t, tekst]) => (
              <div key={t} className="rounded-2xl border border-borderc bg-white p-6">
                <h3 className="font-black text-brand">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-brand/60">{tekst}</p>
              </div>
            ))}
          </div>
          <CoachApplyForm />
        </div>
      </section>
    </main>
  );
}
