import Link from "next/link";
import { sessieVanToken, vinkAfViaToken, haalVinkjeWeg } from "./actions";
import { AFVINK_OORDELEN, afvinkPad } from "@/lib/coaching/levering.js";

// De landingspagina van de drie knoppen uit de deurcodemail. Eén tik = sessie afgevinkt, zonder
// login en zonder formulier. Zelfde vorm als /f/{token}, en om dezelfde reden: de handeling hoort
// te gebeuren waar het lid al is.
//
// WAAROM EEN GET MAG SCHRIJVEN. Normaal is dat fout — een linkscanner of een prefetcher haalt de
// URL op en de handeling gebeurt zonder mens. Hier valt dat weg door het venster: de mail vertrekt
// vijf minuten VÓÓR de sessie begint, en `vinkAfViaToken` weigert alles vóór `starts_at`. Een
// automatische fetch komt binnen seconden na verzending en botst dus altijd op die grens. Een mens
// tikt na zijn training. Dat is geen toeval maar de reden dat de ondergrens van het venster er staat.

export const dynamic = "force-dynamic";
export const metadata = { title: "Afgevinkt | Fittin'", robots: { index: false, follow: false } };

export default async function SessieAfvinken({ params, searchParams }) {
  const { token } = await params;
  const sp = (await searchParams) || {};
  const gevraagd = String(Array.isArray(sp.v) ? sp.v[0] : sp.v || "");

  // Eerst schrijven, dan pas lezen: anders toont het scherm de stand van vóór de tik.
  let fout = null;
  if (AFVINK_OORDELEN.some((o) => o.v === gevraagd)) {
    const r = await vinkAfViaToken(token, gevraagd);
    if (r?.error) fout = r.error;
  }
  const d = await sessieVanToken(token);

  if (!d) return <Kaart emoji="🕓" titel="Deze link werkt niet meer">
    <p>Links uit je deurcodemail blijven vier dagen geldig. Afvinken kan altijd nog op je coachingpagina.</p>
    <Knop href="/coaching">Naar mijn coaching</Knop>
  </Kaart>;

  if (d.status === "geen_sessie") return <Kaart emoji="👋" titel="Er hangt geen sessie aan deze boeking">
    <p>Misschien was dit een losse training, of stond je plan op pauze toen je boekte.</p>
    <Knop href="/coaching">Naar mijn coaching</Knop>
  </Kaart>;

  if (!d.begonnen) return <Kaart emoji="💪" titel="Je sessie moet nog beginnen">
    <p>Hou deze mail bij de hand — vink af zodra je klaar bent, dan stuurt het je volgende week.</p>
    <Knop href="/coaching">Naar mijn coaching</Knop>
  </Kaart>;

  const gedaan = !!d.sessie.gedaan_at;
  const alleAf = d.gepland > 0 && d.gedaan >= d.gepland;
  const gekozen = d.sessie.oordeel;
  const label = AFVINK_OORDELEN.find((o) => o.v === gekozen)?.l;

  return (
    <Kaart emoji={gedaan ? "✅" : "💪"} titel={gedaan ? "Afgevinkt" : "Hoe voelde het?"}>
      <p className="text-brand">
        <b>Week {d.week?.weeknummer} · {d.naam}</b>
        {gedaan && label ? <> — je gaf aan dat het <b>{label.toLowerCase()}</b> was.</> : null}
      </p>

      {/* De knoppen blijven staan, ook na een tik: wie zich vergist, corrigeert met één tik meer.
          `prefetch={false}` is hier geen optimalisatie maar een correctheidseis: deze URL schrijft,
          en Next zou hem anders vooraf ophalen zodra hij in beeld komt — dan koos de browser het
          oordeel in plaats van het lid. */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {AFVINK_OORDELEN.map((o) => (
          <Link key={o.v} href={afvinkPad(token, o.v)} replace prefetch={false}
            className={"rounded-xl border-2 px-2 py-3 text-center text-sm font-bold transition " +
              (gekozen === o.v ? "border-accent bg-accent/10 text-brand" : "border-borderc text-brand/70 hover:border-accent")}>
            {o.l}
          </Link>
        ))}
      </div>
      <p className="mt-2 text-xs text-brand/45">
        {gedaan
          ? "Dit stuurt je volgende week: zwaarder, gelijk of lichter. Vergist? Tik gewoon een andere."
          : "Eén tik is genoeg. Meer vragen we niet."}
      </p>

      {fout && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{fout}</p>}

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
              ? "Je week zit erop. Nog vier tikken op je coachingpagina en je volgende week wordt daarop gebouwd."
              : alleAf
                ? "Je week zit erop en je check-in staat er. Zondag zet je coach de volgende week klaar."
                : `Nog ${d.gepland - d.gedaan} te gaan. Boek je volgende moment wanneer het je uitkomt.`}
          </p>
        </div>
      )}

      {gedaan && (
        <form action={haalVinkjeWeg} className="mt-4">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="text-xs font-bold text-brand/45 underline transition hover:text-brand">
            Toch niet getraind — vinkje weghalen
          </button>
        </form>
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
