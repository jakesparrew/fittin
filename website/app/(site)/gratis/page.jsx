import Link from "next/link";
import GymFotos, { GymFoto } from "@/components/GymFotos";

// Campagne-landingspagina voor de "eerste sessie gratis"-advertentie.
//
// WAAROM DIT EEN APARTE PAGINA IS EN NIET /boeken: koud advertentieverkeer landt niet op een
// boekingskalender. Die beantwoordt "wanneer", terwijl iemand die net de advertentie zag nog op
// "wat is dit" en "waarom" zit. Deze pagina doet één ding: de belofte van de advertentie herhalen
// (message match — de advertentie zegt "Je 1e sessie gratis", de eerste regel hier zegt hetzelfde),
// kort uitleggen hoe het werkt, en dan één knop naar de kalender. Geen tweede boodschap, geen
// afleiding.
//
// noindex: dit is een advertentiepagina, geen zoekpagina. Ze mag niet met de homepage concurreren
// in Google en niet buiten de advertentiecontext gevonden worden.

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Je 1e sessie gratis | Fittin'",
  description: "Een privégym in Gent, een uur helemaal voor jou. Geen lidgeld. Je eerste sessie is gratis — boek ze online.",
  robots: { index: false },
  alternates: { canonical: "https://fittin.be/gratis" },
};

// De UTM-labels van de advertentie doorgeven aan de boekingslink, zodat de hele trechter — van
// klik tot boeking — hetzelfde campagnelabel draagt. De attributie leunt ook op de bezoeker-
// vingerafdruk (zie /api/pv), maar dit is de gordel naast de bretel.
function boekenHref(sp) {
  const params = new URLSearchParams();
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = Array.isArray(sp?.[k]) ? sp[k][0] : sp?.[k];
    if (v) params.set(k, String(v).slice(0, 80));
  }
  const q = params.toString();
  return q ? `/boeken?${q}` : "/boeken";
}

const BEATS = [
  ["De hele zaal, alleen voor jou", "Geen wachtrij aan de squatrack, geen muziek waar je niets over te zeggen hebt. Je boekt een uur en de zaal is van jou — alleen, of met maximaal 4 vrienden."],
  ["Geen lidgeld, geen contract", "Je betaalt € 15 voor je uur, meer niet. Kom je vaker, dan wordt het € 12. Kom je niet, dan betaal je niets. Opzeggen hoeft nooit, want er is niks om op te zeggen."],
  ["Boeken en binnen met je telefoon", "Reserveer online in 30 seconden. Je deurcode komt automatisch ± 5 minuten voor je begint. Geen receptie, geen sleutel, open van 6 tot 23 uur."],
];

const STAPPEN = [
  ["Maak je gratis account", "Met e-mail of Google, in 30 seconden. Geen lidgeld, geen verplichting."],
  ["Boek je eerste uur — gratis", "Kies een moment dat jou past. Je eerste sessie is automatisch gratis."],
  ["Open de deur en train", "Je code komt vanzelf voor je sessie. De hele zaal voor jou."],
];

export default async function GratisLanding({ searchParams }) {
  const sp = (await searchParams) || {};
  const naarBoeken = boekenHref(sp);

  return (
    <main className="bg-white">
      {/* ── Hero — message match met de advertentie ── */}
      <section className="relative overflow-hidden bg-brand text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.25em] text-accent">Privégym in Gent</p>
            <h1 className="mt-4 text-5xl font-black leading-[0.95] md:text-6xl">
              Je 1<sup className="text-[0.5em] align-super">e</sup> sessie{" "}
              <span className="text-accent">gratis.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-white/75">
              Een uur in je eigen gym, in hartje Sint-Amandsberg. Geen lidgeld — je betaalt enkel
              voor je tijd. Probeer het eerste uur gratis.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href={naarBoeken}
                className="rounded-full bg-accent px-8 py-4 text-lg font-black text-brand shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:opacity-95"
              >
                Boek je gratis uur →
              </Link>
              <span className="text-sm font-semibold text-white/55">30 seconden · geen kaart nodig</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-black/20">
            <GymFoto
              slug="zaal-logo-2"
              priority
              sizes="(max-width: 768px) 100vw, 480px"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* ── Waarom (drie beats) ── */}
      <section className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-5 md:grid-cols-3">
            {BEATS.map(([titel, tekst], i) => (
              <div key={titel} className="flex flex-col rounded-3xl border border-borderc bg-white p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-lg font-black text-accentdark">
                  {i + 1}
                </span>
                <h2 className="mt-5 text-xl font-black text-brand">{titel}</h2>
                <p className="mt-2 text-sm leading-relaxed text-brand/60">{tekst}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── De zaal in beeld ── */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">De zaal</p>
          <h2 className="mt-3 max-w-xl text-3xl font-black text-brand md:text-4xl">
            Dit is waar je traint. En tijdens jouw uur staat er niemand anders.
          </h2>
          <GymFotos slugs={["zaal-logo", "dumbbells", "training-logo"]} className="mt-10" />
        </div>
      </section>

      {/* ── Hoe het werkt ── */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-accent">Zo begin je</p>
          <h2 className="mt-3 text-3xl font-black md:text-4xl">In drie stappen binnen</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STAPPEN.map(([titel, tekst], i) => (
              <div key={titel}>
                <span className="text-5xl font-black text-accent/30">0{i + 1}</span>
                <h3 className="mt-3 text-xl font-black">{titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{tekst}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Slot-CTA + geruststelling ── */}
      <section className="bg-paper">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="text-3xl font-black text-brand md:text-4xl">Klaar om het te proberen?</h2>
          <p className="mx-auto mt-3 max-w-md text-brand/60">
            Je eerste uur is gratis. Bevalt het niet, dan heb je niets verloren — geen lidgeld, geen
            verplichting.
          </p>
          <Link
            href={naarBoeken}
            className="mt-8 inline-flex rounded-full bg-accent px-10 py-4 text-lg font-black text-brand shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:opacity-95"
          >
            Boek je gratis uur →
          </Link>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-brand/50">
            <span>📍 Aannemersstraat 186, 9040 Gent</span>
            <span>🅿️ Gratis parking</span>
            <span>🕕 Elke dag 6–23u</span>
          </div>
        </div>
      </section>
    </main>
  );
}
