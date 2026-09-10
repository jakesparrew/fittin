import Link from "next/link";
import { sessieVanToken } from "./actions";
import { AFVINK_OORDELEN } from "@/lib/coaching/levering.js";
import AfvinkKnoppen from "@/components/coaching/AfvinkKnoppen";

// De landingspagina van de afvinkknop uit de deurcodemail. Zelfde vorm als /f/{token}, en om
// dezelfde reden: de handeling hoort te gebeuren waar het lid al is.
//
// DEZE PAGINA SCHRIJFT NIETS TIJDENS HET RENDEREN. Dat is een correctie op de eerste versie, waarin
// de mail drie links `?v=…` droeg die het oordeel al vastlegden bij het openen. Twee dingen braken
// daarop: een linkscanner die elke URL in een mail ophaalt koos dan het oordeel voor het lid, en
// `?v=` bleef in de adresbalk staan zodat "vinkje weghalen" zichzelf meteen terugzette. Schrijven
// gebeurt nu uitsluitend via een POST uit AfvinkKnoppen.

export const dynamic = "force-dynamic";
export const metadata = { title: "Afvinken | Fittin'", robots: { index: false, follow: false } };

export default async function SessieAfvinken({ params }) {
  const { token } = await params;
  const d = await sessieVanToken(token);

  if (!d) return <Kaart emoji="🕓" titel="Deze link werkt niet meer">
    <p>Links uit je deurcodemail blijven vier dagen geldig. Afvinken kan altijd nog op je coachingpagina.</p>
    <Knop href="/coaching">Naar mijn coaching</Knop>
  </Kaart>;

  if (!d.begonnen) return <Kaart emoji="💪" titel="Je sessie moet nog beginnen">
    <p>Hou deze mail bij de hand — vink af zodra je klaar bent, dan stuurt het je volgende week.</p>
    <Knop href="/coaching">Naar mijn coaching</Knop>
  </Kaart>;

  const gedaan = !!d.sessie.gedaan_at;
  const alleAf = d.gepland > 0 && d.gedaan >= d.gepland;
  const label = AFVINK_OORDELEN.find((o) => o.v === d.sessie.oordeel)?.l;

  return (
    <Kaart emoji={gedaan ? "✅" : "💪"} titel={gedaan ? "Afgevinkt" : "Hoe voelde het?"}>
      <p className="text-brand">
        <b>Week {d.week?.weeknummer} · {d.naam}</b>
        {gedaan && label ? <> — je gaf aan dat het <b>{label.toLowerCase()}</b> was.</> : null}
      </p>

      <AfvinkKnoppen token={token} gedaan={gedaan} oordeel={d.sessie.oordeel} />

      {gedaan && (
        <div className="mt-6 rounded-2xl bg-paper px-4 py-3">
          <p className="text-sm font-bold text-brand">{d.gedaan} van {d.gepland} sessies deze week</p>
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: d.gepland }, (_, i) => (
              <span key={i} className={"h-2 flex-1 rounded-full " + (i < d.gedaan ? "bg-accent" : "bg-borderc")} />
            ))}
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
            {alleAf && !d.checkinIngevuld
              ? "Je week zit erop. Nog een paar tikken op je coachingpagina en je volgende week wordt daarop gebouwd."
              : alleAf
                ? "Je week zit erop en je check-in staat er. Zondag zet je coach de volgende week klaar."
                : `Nog ${d.gepland - d.gedaan} te gaan. Boek je volgende moment wanneer het je uitkomt.`}
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Knop href="/coaching">{alleAf && !d.checkinIngevuld ? "Check-in invullen" : "Naar mijn coaching"}</Knop>
        {!alleAf && <Knop href="/boeken" stil>Volgende sessie boeken</Knop>}
      </div>
    </Kaart>
  );
}

function Kaart({ emoji, titel, children }) {
  return (
    <main className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-md">
        <p className="text-2xl font-black text-brand">Fittin<span className="text-accent">&rsquo;</span></p>
        <div className="anim-in mt-6 rounded-3xl border border-borderc bg-white p-7">
          <p className="text-3xl">{emoji}</p>
          <h1 className="mt-2 font-display text-2xl font-black text-brand">{titel}</h1>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">{children}</div>
        </div>
      </div>
    </main>
  );
}

function Knop({ href, children, stil = false }) {
  return (
    <Link href={href}
      className={"inline-flex rounded-full px-5 py-2.5 text-sm font-bold transition hover:opacity-90 " +
        (stil ? "border-2 border-borderc text-brand" : "bg-accent text-brand")}>
      {children}
    </Link>
  );
}
