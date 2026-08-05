export const metadata = {
  title: "Privacybeleid | Fittin'",
  description:
    "Hoe Fittin' (De Wereld Draait Door VZW) je persoonsgegevens verwerkt: welke gegevens, waarom, hoe lang, met wie we ze delen en welke rechten je hebt.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/privacy` },
};

// GDPR-verantwoording bij dit document:
//  • Lichaamsmetingen en trainingslogs zijn GEZONDHEIDSGEGEVENS (art. 9 AVG). Die mogen enkel op
//    basis van uitdrukkelijke toestemming, niet op "uitvoering van de overeenkomst". Daarom staan
//    ze hier apart, en vraagt de app die toestemming afzonderlijk vóór je iets invult.
//  • Stripe, Resend en Vercel verwerken (deels) buiten de EU. Doorgifte moet benoemd worden mét
//    de waarborg — het volstaat niet te zwijgen omdat de database zelf in de EU staat.
//  • Bewaartermijnen moeten concreet zijn, of minstens het criterium waarmee ze bepaald worden.
//    "Zolang je een account hebt" is op zichzelf te vaag.
const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-xl font-black text-brand">{title}</h2>
    <div className="mt-3 space-y-3 leading-relaxed text-brand/70">{children}</div>
  </section>
);

const Mail = () => (
  <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>
);

const Row = ({ wat, hoelang }) => (
  <tr className="border-b border-borderc last:border-0">
    <td className="py-2.5 pr-4 align-top font-semibold text-brand">{wat}</td>
    <td className="py-2.5 align-top">{hoelang}</td>
  </tr>
);

export default function Privacy() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Privacy</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">Privacybeleid</h1>
        <p className="mt-3 text-sm text-brand/50">Versie 2 — laatst bijgewerkt: 5 augustus 2026</p>

        <p className="mt-6 leading-relaxed text-brand/70">
          Fittin&rsquo; verwerkt je persoonsgegevens volgens de Algemene Verordening
          Gegevensbescherming (AVG/GDPR). Hieronder lees je precies welke gegevens we bijhouden,
          waarom we dat mogen, hoe lang we ze bewaren en wat je zelf kan doen. We verkopen je
          gegevens nooit en we gebruiken geen reclame- of trackingtechnologie.
        </p>

        <Section title="1. Wie is verantwoordelijk?">
          <p>
            De verwerkingsverantwoordelijke is <strong>De Wereld Draait Door VZW</strong> (Fittin&rsquo;),
            Aannemersstraat 186, 9040 Gent, België — ondernemingsnummer <strong>BE 0772.565.606</strong>.
            Voor alles wat met je gegevens te maken heeft, mail je <Mail />. We zijn niet verplicht een
            functionaris voor gegevensbescherming aan te stellen; je vragen komen rechtstreeks bij de
            zaakvoerder terecht.
          </p>
        </Section>

        <Section title="2. Welke gegevens verwerken we, en waarom mogen we dat?">
          <p>Per soort gegeven staat hieronder ook de wettelijke grondslag.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Accountgegevens</strong> — je naam, e-mailadres en (als je via Google inlogt) je
              Google-profielnaam. <em>Grondslag: uitvoering van de overeenkomst.</em>
            </li>
            <li>
              <strong>Boekingen en betalingen</strong> — je reserveringen, tegoeden, abonnement, en per
              betaling het bedrag, de datum en de status. <em>Grondslag: uitvoering van de overeenkomst,
              en wettelijke verplichting voor de boekhouding.</em> Je kaartgegevens komen nooit bij ons
              terecht; die gaan rechtstreeks naar Stripe.
            </li>
            <li>
              <strong>Toegang tot de zaal</strong> — welke toegangscode voor welke boeking is aangemaakt
              en wanneer de deur openging. <em>Grondslag: uitvoering van de overeenkomst en ons
              gerechtvaardigd belang bij de beveiliging van een onbemande zaal.</em>
            </li>
            <li>
              <strong>Gezondheidsgerelateerde gegevens</strong> — je lichaamsmetingen (gewicht, lengte,
              streefgewicht) en je trainingslogs, <strong>alleen als je die zelf invult</strong>.
              Dit zijn bijzondere categorieën van gegevens.{" "}
              <em>Grondslag: jouw uitdrukkelijke toestemming (art. 9.2.a AVG).</em> Die vragen we
              afzonderlijk, je kan ze op elk moment intrekken, en zonder die toestemming werkt de rest
              van Fittin&rsquo; gewoon.
            </li>
            <li>
              <strong>Communicatie</strong> — berichten met je coach of met ons, en je meldingen over
              defecten. <em>Grondslag: uitvoering van de overeenkomst.</em>
            </li>
            <li>
              <strong>Nieuwsbrief</strong> — je e-mailadres en je voorkeuren.{" "}
              <em>Grondslag: jouw toestemming</em>, in te trekken via de link onderaan elke mail.
            </li>
            <li>
              <strong>Bezoekstatistieken</strong> — welke pagina&rsquo;s bezocht worden, van welke website
              je kwam en of je op gsm of computer zit. Er wordt daarbij een dagelijks wisselende,
              onomkeerbare code gebruikt in plaats van je IP-adres.{" "}
              <em>Grondslag: gerechtvaardigd belang</em> bij het begrijpen en verbeteren van onze site.
              Details staan op onze <a href="/cookies" className="font-semibold text-accentdark hover:underline">cookiepagina</a>.
            </li>
            <li>
              <strong>Foutmeldingen</strong> — als er iets misgaat in je browser, loggen we het
              foutbericht en de pagina. <em>Grondslag: gerechtvaardigd belang</em> bij een werkende app.
            </li>
          </ul>
          <p>
            We nemen <strong>geen geautomatiseerde beslissingen</strong> met rechtsgevolgen voor jou en
            we maken geen profielen om je gedrag te voorspellen.
          </p>
        </Section>

        <Section title="3. Gegevens van iemand anders dan jezelf">
          <p>
            Nodig je iemand uit voor een sessie, of geeft een coach de naam op van een klant die zelf
            geen Fittin&rsquo;-account heeft, dan verwerken wij ook diens gegevens — beperkt tot wat nodig
            is om te weten wie er in de zaal komt. Wie zo&rsquo;n naam doorgeeft, is er zelf verantwoordelijk
            voor dat die persoon daarvan op de hoogte is. Wij gebruiken die gegevens voor niets anders
            en verwijderen ze samen met de boeking.
          </p>
        </Section>

        <Section title="4. Hoe lang bewaren we wat?">
          <div className="overflow-x-auto rounded-2xl border border-borderc bg-white p-4">
            <table className="w-full text-sm">
              <tbody>
                <Row wat="Account en profiel" hoelang="Zolang je account bestaat, en tot 12 maanden na je laatste sessie als je niets meer van je laat horen. Daarna verwijderen of anonimiseren we." />
                <Row wat="Boekingen" hoelang="3 jaar — zodat we vragen of geschillen over een sessie kunnen beantwoorden." />
                <Row wat="Betalingen en facturen" hoelang="7 jaar, wettelijke bewaartermijn voor de boekhouding. Deze gegevens verdwijnen dus niet bij het verwijderen van je account." />
                <Row wat="Toegangscodes en deurlogs" hoelang="Codes worden na je sessie meteen ingetrokken. Logs bewaren we 12 maanden voor de veiligheid van een onbemande zaal." />
                <Row wat="Lichaamsmetingen en trainingslogs" hoelang="Zolang je toestemming loopt. Trek je ze in, dan wissen we ze." />
                <Row wat="Nieuwsbrief" hoelang="Tot je uitschrijft. Je uitschrijving zelf houden we bij zodat we je niet opnieuw aanschrijven." />
                <Row wat="Bezoekstatistieken" hoelang="14 maanden, daarna enkel nog als totalen zonder enige herleidbaarheid." />
                <Row wat="Foutmeldingen" hoelang="12 maanden." />
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="5. Met wie delen we gegevens?">
          <p>
            We verkopen je gegevens nooit en gebruiken ze niet voor reclame van derden. We werken met
            een beperkt aantal verwerkers, elk met een verwerkersovereenkomst en enkel voor wat ze
            nodig hebben:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Supabase</strong> — database en accounts, gehost in de Europese Unie.</li>
            <li><strong>Stripe</strong> — betalingen. PCI-DSS-gecertificeerd.</li>
            <li><strong>Resend</strong> — verzending van e-mails.</li>
            <li><strong>Vercel</strong> — hosting van de website.</li>
            <li><strong>Nuki</strong> — het slimme deurslot en de toegangscodes.</li>
          </ul>
          <p>
            <strong>Doorgifte buiten de Europese Economische Ruimte.</strong> Stripe, Resend en Vercel
            zijn Amerikaanse bedrijven en kunnen gegevens (laten) verwerken buiten de EER. Dat gebeurt
            op basis van de standaardcontractbepalingen van de Europese Commissie, aangevuld met het
            EU-VS Data Privacy Framework waar de partij daarvoor gecertificeerd is. Een kopie van die
            waarborgen kan je opvragen via <Mail />.
          </p>
          <p>
            Daarnaast delen we gegevens met je coach wanneer je met die coach traint of verbonden bent
            — dan ziet die je naam, je sessies en wat je zelf met hem deelt.
          </p>
        </Section>

        <Section title="6. Hoe beveiligen we je gegevens?">
          <p>
            Alle verbindingen verlopen versleuteld. Toegang tot de database is beperkt per rol, zodat
            een lid enkel zijn eigen gegevens ziet en een coach enkel die van zijn verbonden clienten.
            Gevoelige sleutels en de deurcode van de zaal staan in een apart, afgeschermd deel van de
            database dat niet vanuit de browser bereikbaar is. Wachtwoorden bewaren we nooit leesbaar.
          </p>
        </Section>

        <Section title="7. Je rechten">
          <p>Je hebt het recht om:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>je gegevens <strong>in te kijken</strong> en er een kopie van te krijgen;</li>
            <li>ze te laten <strong>verbeteren</strong> als er iets niet klopt;</li>
            <li>ze te laten <strong>verwijderen</strong>;</li>
            <li>de verwerking te laten <strong>beperken</strong> of er <strong>bezwaar</strong> tegen te maken;</li>
            <li>je gegevens <strong>mee te nemen</strong> in een leesbaar bestand;</li>
            <li>je <strong>toestemming in te trekken</strong>, zonder dat dit iets afdoet aan wat daarvoor gebeurde.</li>
          </ul>
          <p>
            Inkijken, downloaden en verwijderen kan je grotendeels <strong>zelf</strong> doen, onderaan{" "}
            <a href="/account" className="font-semibold text-accentdark hover:underline">je account</a>.
            Liever per mail? Schrijf naar <Mail />; we antwoorden binnen 30 dagen.
          </p>
          <p>
            Ben je het niet eens met hoe we met je gegevens omgaan, dan kan je klacht indienen bij de
            Belgische Gegevensbeschermingsautoriteit, Drukpersstraat 35, 1000 Brussel —{" "}
            <a href="https://www.gegevensbeschermingsautoriteit.be" target="_blank" rel="noopener noreferrer" className="font-semibold text-accentdark hover:underline">gegevensbeschermingsautoriteit.be</a>.
          </p>
        </Section>

        <Section title="8. Wijzigingen">
          <p>
            We kunnen dit privacybeleid aanpassen. Bij belangrijke wijzigingen verwittigen we je per
            e-mail. De meest recente versie staat altijd op deze pagina, met het versienummer en de
            datum bovenaan.
          </p>
        </Section>
      </div>
    </main>
  );
}
