export const metadata = {
  title: "Privacybeleid | Fittin'",
  description: "Hoe Fittin' (De Wereld Draait Door VZW) je persoonsgegevens verwerkt en beschermt — conform de GDPR.",
};

const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-xl font-black text-brand">{title}</h2>
    <div className="mt-3 space-y-3 leading-relaxed text-brand/70">{children}</div>
  </section>
);

export default function Privacy() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Privacy</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">Privacybeleid</h1>
        <p className="mt-3 text-sm text-brand/50">Laatst bijgewerkt: juni 2026</p>

        <p className="mt-6 leading-relaxed text-brand/70">
          Fittin&rsquo; respecteert je privacy en verwerkt je persoonsgegevens volgens de Algemene
          Verordening Gegevensbescherming (GDPR). Hieronder lees je welke gegevens we verwerken, waarom,
          hoe lang en welke rechten je hebt.
        </p>

        <Section title="1. Wie is verantwoordelijk?">
          <p>
            De verwerkingsverantwoordelijke is <strong>De Wereld Draait Door VZW</strong> (Fittin&rsquo;),
            Aannemersstraat 186, 9040 Gent, België — ondernemingsnummer <strong>BE 0772.565.606</strong>.
            Vragen over je gegevens? Mail <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>.
          </p>
        </Section>

        <Section title="2. Welke gegevens verwerken we?">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Accountgegevens:</strong> naam en e-mailadres (en, indien je via Google inlogt, je Google-profielnaam).</li>
            <li><strong>Boekingen &amp; toegang:</strong> je reserveringen, sessie­tegoeden en deurtoegang-logs (wanneer je de zaal opent).</li>
            <li><strong>Betalingen:</strong> bedrag, datum en status. Je <strong>kaartgegevens worden nooit door ons bewaard</strong> — die verlopen rechtstreeks via Stripe.</li>
            <li><strong>Trainingsgegevens:</strong> optionele lichaamsmetingen (gewicht, lengte, doel) en je trainingslogs, enkel als je die zelf invult.</li>
            <li><strong>Communicatie:</strong> berichten met je coach of het Fittin&rsquo;-team, en je nieuwsbrief-voorkeur.</li>
            <li><strong>Technische gegevens:</strong> geanonimiseerde bezoekstatistieken (zie cookies &amp; analytics).</li>
          </ul>
        </Section>

        <Section title="3. Waarom en op welke grondslag?">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Uitvoering van de overeenkomst:</strong> je account beheren, sessies boeken, betalingen verwerken en de deur openen tijdens je sessie.</li>
            <li><strong>Gerechtvaardigd belang:</strong> beveiliging, fraudepreventie en het verbeteren van onze dienst via geanonimiseerde statistieken.</li>
            <li><strong>Toestemming:</strong> de nieuwsbrief en marketingmails — die kan je op elk moment intrekken via de link onderaan elke mail.</li>
            <li><strong>Wettelijke verplichting:</strong> boekhoudkundige bewaring van facturatiegegevens.</li>
          </ul>
        </Section>

        <Section title="4. Met wie delen we gegevens?">
          <p>We verkopen je gegevens nooit. We werken met zorgvuldig gekozen verwerkers die enkel verwerken wat nodig is:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Supabase</strong> — database &amp; accounts (hosting in de EU)</li>
            <li><strong>Stripe</strong> — betalingen (PCI-DSS-gecertificeerd)</li>
            <li><strong>Resend</strong> — verzending van transactionele en nieuwsbrief-e-mails</li>
            <li><strong>Vercel</strong> — hosting van de website en cookieloze bezoekstatistieken</li>
            <li><strong>Nuki</strong> — beveiligde deurtoegang (per-boeking toegangscodes)</li>
          </ul>
        </Section>

        <Section title="5. Hoe lang bewaren we je gegevens?">
          <p>
            We bewaren je gegevens zolang je een account hebt en zolang nodig voor de hierboven beschreven
            doeleinden. Facturatiegegevens bewaren we volgens de wettelijke termijn. Wanneer je je account
            laat verwijderen, wissen of anonimiseren we je persoonsgegevens (behalve wat we wettelijk moeten bijhouden).
          </p>
        </Section>

        <Section title="6. Cookies &amp; analytics">
          <p>
            We gebruiken <strong>geen reclame- of trackingcookies</strong>. Voor bezoekstatistieken gebruiken we
            cookieloze, geanonimiseerde analyse (Vercel Analytics en onze eigen, geanonimiseerde paginaweergaves).
            Er worden dus geen persoonlijke profielen opgebouwd voor advertenties.
          </p>
        </Section>

        <Section title="7. Je rechten">
          <p>Je hebt het recht op inzage, correctie, verwijdering, beperking, bezwaar en overdraagbaarheid van je gegevens.</p>
          <p>
            Stuur je verzoek naar <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>.
            Ben je het niet eens met hoe we je gegevens verwerken? Dan kan je klacht indienen bij de Belgische
            Gegevensbeschermingsautoriteit (<a href="https://www.gegevensbeschermingsautoriteit.be" className="font-semibold text-accentdark hover:underline" target="_blank" rel="noopener noreferrer">gegevensbeschermingsautoriteit.be</a>).
          </p>
        </Section>

        <Section title="8. Wijzigingen">
          <p>
            We kunnen dit privacybeleid aanpassen. De meest recente versie vind je altijd op deze pagina, met
            de datum van laatste wijziging bovenaan.
          </p>
        </Section>
      </div>
    </main>
  );
}
