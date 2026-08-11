export const metadata = {
  title: "Cookies & opslag | Fittin'",
  description:
    "Wat Fittin' in je browser opslaat — en waarom je geen cookiebanner ziet: we gebruiken geen reclame- of trackingcookies en bewaren niets dat niet strikt nodig is.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/cookies` },
};

// Waarom deze pagina bestaat en waarom er GEEN banner is:
// Artikel 5(3) van de ePrivacy-richtlijn (in België omgezet in art. XII.13 WER) vraagt toestemming
// voor het opslaan van of toegang krijgen tot informatie op het toestel van de bezoeker, TENZIJ dat
// strikt noodzakelijk is voor een dienst die de bezoeker uitdrukkelijk gevraagd heeft. Fittin' slaat
// enkel zulke strikt noodzakelijke dingen op: een inlogsessie en een paar "ik heb dit weggeklikt"-
// voorkeuren. De bezoekstatistieken schrijven niets naar het toestel weg. Daarom is een banner hier
// niet verplicht — en een banner tonen die niets te vragen heeft, is misleidend.
// Zie ook de toelichting bovenaan lib/track.js.
const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-xl font-black text-brand">{title}</h2>
    <div className="mt-3 space-y-3 leading-relaxed text-brand/70">{children}</div>
  </section>
);

const Item = ({ naam, doel, duur }) => (
  <tr className="border-b border-borderc last:border-0">
    <td className="py-2.5 pr-4 align-top font-mono text-xs font-semibold text-brand">{naam}</td>
    <td className="py-2.5 pr-4 align-top">{doel}</td>
    <td className="whitespace-nowrap py-2.5 align-top text-brand/50">{duur}</td>
  </tr>
);

export default function Cookies() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Cookies</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">Cookies &amp; opslag</h1>
        <p className="mt-3 text-sm text-brand/50">Versie 1 — laatst bijgewerkt: 5 augustus 2026</p>

        <div className="mt-6 rounded-3xl border-2 border-accent bg-accent/10 p-6">
          <p className="font-black text-brand">Je krijgt hier geen cookiebanner. Dat is geen vergetelheid.</p>
          <p className="mt-2 leading-relaxed text-brand/70">
            We gebruiken <strong>geen reclamecookies, geen trackingcookies en geen cookies van derden</strong>.
            Er staat niets van Google, Meta of een advertentienetwerk op deze site. Het enige dat in je
            browser terechtkomt, is wat nodig is om je ingelogd te houden en om te onthouden dat je een
            melding hebt weggeklikt. Voor zulke strikt noodzakelijke opslag moet — en mag — er geen
            toestemming gevraagd worden.
          </p>
        </div>

        <Section title="Wat staat er dan wél in je browser?">
          <div className="overflow-x-auto rounded-2xl border border-borderc bg-white p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borderc text-left text-xs font-bold uppercase tracking-wide text-lav">
                  <th className="pb-2 pr-4">Naam</th>
                  <th className="pb-2 pr-4">Waarvoor</th>
                  <th className="pb-2">Hoelang</th>
                </tr>
              </thead>
              <tbody>
                <Item
                  naam="sb-…-auth-token"
                  doel="Houdt je ingelogd. Zonder deze cookie moet je bij elke pagina opnieuw inloggen. Gezet door Supabase, onze database- en accountleverancier."
                  duur="Tot je uitlogt"
                />
                <Item
                  naam="fittin-pwa-dismissed"
                  doel="Onthoudt dat je de tip om de app op je startscherm te zetten hebt weggeklikt, zodat we het niet blijven vragen."
                  duur="14 dagen"
                />
                <Item
                  naam="fittin-ios-relogin-dismissed"
                  doel="Onthoudt dat je de melding over opnieuw inloggen op iPhone hebt weggeklikt."
                  duur="Tot je je browsergegevens wist"
                />
                <Item
                  naam="fittin_coach_checklist_snoozed"
                  doel="Enkel voor coaches: onthoudt dat de startchecklist even verborgen mag blijven."
                  duur="3 dagen"
                />
                <Item
                  naam="fittin_admin_nav_collapsed"
                  doel="Enkel voor beheerders: onthoudt welke menu's in het beheerpaneel open of dicht staan."
                  duur="Tot je je browsergegevens wist"
                />
                <Item
                  naam="fittin_chunk_herstel"
                  doel="Onthoudt heel even dat de pagina zichzelf al eens ververst heeft nadat er een stuk van de site niet binnenkwam. Zonder dat zou de pagina in een herlaadlus kunnen belanden."
                  duur="Tot je dit tabblad sluit"
                />
              </tbody>
            </table>
          </div>
          <p className="text-sm">
            Alles in deze lijst is een voorkeur of een inlogsessie van jou, en niets ervan wordt gedeeld
            met iemand anders of gebruikt om je te volgen over andere websites.
          </p>
        </Section>

        <Section title="En hoe tellen jullie dan bezoekers?">
          <p>
            Met een eigen teller die <strong>niets in je browser opslaat</strong>. Bij elke pagina die je
            opent, sturen we één bericht naar onze eigen server met: welke pagina, van welke website je
            kwam, en of je op gsm of computer zit.
          </p>
          <p>
            Om te kunnen zien of twee paginaweergaves van dezelfde persoon komen, maken we een korte
            code op basis van je IP-adres en je browsertype, samen met de datum en een geheime sleutel.
            Die code is <strong>niet omkeerbaar</strong> — we kunnen er je IP-adres niet uit terughalen —
            en ze <strong>verandert elke dag</strong>. Morgen ben je dus opnieuw een onbekende bezoeker.
            Er wordt geen profiel opgebouwd en je gedrag wordt niet over meerdere dagen gevolgd.
          </p>
          <p>
            Kom je binnen via een advertentie of een campagnelink, dan lezen we het campagnelabel uit de
            link zelf (de <code className="rounded bg-paper px-1 py-0.5 text-xs">utm_</code>-stukjes). Ook
            dat bewaren we niet in je browser.
          </p>
        </Section>

        <Section title="Wat als je toch niets wil doorsturen?">
          <p>
            Je kan de bezoekstatistieken blokkeren met eender welke adblocker of met de
            &ldquo;niet volgen&rdquo;-instellingen van je browser; de site blijft volledig werken. De
            inlogcookie kan je niet uitzetten — zonder die cookie kan je simpelweg niet ingelogd blijven.
            Je kan alle opslag altijd wissen via de instellingen van je browser.
          </p>
        </Section>

        <Section title="Meer weten?">
          <p>
            Welke gegevens we verwerken en hoe lang we ze bewaren, staat in ons{" "}
            <a href="/privacy" className="font-semibold text-accentdark hover:underline">privacybeleid</a>.
            Vragen? Mail <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>.
          </p>
        </Section>
      </div>
    </main>
  );
}
