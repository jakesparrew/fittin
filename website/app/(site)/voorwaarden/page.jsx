export const metadata = {
  title: "Algemene voorwaarden | Fittin'",
  description:
    "De algemene voorwaarden van Fittin' (De Wereld Draait Door VZW): sessies, beurtenkaarten, abonnement, betalen, verplaatsen, herroepingsrecht, aansprakelijkheid en klachten.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/voorwaarden` },
};

// Juridische basis: Boek VI van het Wetboek van economisch recht (marktpraktijken en
// consumentenbescherming) en Boek III (identificatieplicht van de onderneming).
// Belangrijke keuzes, zodat een latere lezer weet waarom er iets staat:
//  • De uitzondering op het herroepingsrecht geldt enkel voor een sessie met een vaste datum
//    (art. VI.53, 12°). Beurtenkaart en abonnement zijn dat NIET — daar geldt het gewone
//    herroepingsrecht van 14 dagen, tenzij het lid uitdrukkelijk vraagt om meteen te starten.
//  • Het Europese ODR-platform is op 20 juli 2025 stopgezet; ernaar verwijzen is sindsdien
//    misleidend. In de plaats staat de Belgische Consumentenombudsdienst.
//  • Aansprakelijkheid wordt NIET uitgesloten voor eigen fout of voor lichamelijke schade —
//    zo'n beding is onrechtmatig (art. VI.83) en zou de hele clausule onderuit halen.
const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-xl font-black text-brand">{title}</h2>
    <div className="mt-3 space-y-3 leading-relaxed text-brand/70">{children}</div>
  </section>
);

const Mail = () => (
  <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>
);

export default function Voorwaarden() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Voorwaarden</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">Algemene voorwaarden</h1>
        <p className="mt-3 text-sm text-brand/50">Versie 2 — laatst bijgewerkt: 5 augustus 2026</p>

        <p className="mt-6 leading-relaxed text-brand/70">
          Deze voorwaarden gelden voor elke boeking, elke aankoop en elk gebruik van Fittin&rsquo;.
          Je aanvaardt ze wanneer je een sessie boekt of een beurtenkaart of abonnement koopt. We
          hebben ze bewust in gewone taal geschreven — vind je iets onduidelijk, vraag het gerust
          via <Mail />.
        </p>

        <Section title="1. Wie zijn we?">
          <p>
            Fittin&rsquo; is een privégym uitgebaat door <strong>De Wereld Draait Door VZW</strong>,
            Aannemersstraat 186, 9040 Gent, België. Ondernemingsnummer <strong>BE 0772.565.606</strong>.
            Contact: <Mail />. We antwoorden op werkdagen normaal binnen één werkdag.
          </p>
        </Section>

        <Section title="2. Onze diensten en onze prijzen">
          <p>
            Alle vermelde prijzen zijn <strong>eindprijzen voor consumenten, inclusief alle taksen</strong>.
            Er komen geen reservatie- of administratiekosten bij.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Losse sessie — € 15.</strong> Eén uur in de zaal, voor 1 tot 4 personen samen.
              Je betaalt voor de gereserveerde tijd en de ruimte, niet per persoon. Er is geen lidgeld.
            </li>
            <li>
              <strong>10-beurtenkaart — € 150.</strong> Goed voor 11 sessies (10 + 1 gratis).
              De beurten zijn <strong>6 maanden geldig</strong> vanaf de aankoop.
            </li>
            <li>
              <strong>Abonnement — € 12 per maand.</strong> Eén sessie is inbegrepen per betaalperiode,
              en elke bijkomende sessie kost je € 12 in plaats van € 15. De inbegrepen sessie stapelt
              niet op: ze blijft geldig tot je volgende verlenging en vervalt dan.
            </li>
            <li>
              <strong>Eerste sessie gratis</strong> met de welkomstcode, eenmalig per persoon.
            </li>
            <li>
              <strong>Personal training</strong> spreek je rechtstreeks af met je coach. De coach bepaalt
              zijn eigen tarief en factureert jou zelf; Fittin&rsquo; staat daar buiten. Voor klanten die
              Fittin&rsquo; bij een coach aanbrengt, geldt voor die coach een hoger sessietarief voor het
              gebruik van de zaal, dat hij vooraf per klant aanvaardt; aan het tarief dat jij met je coach
              afspreekt, verandert dat niets.
            </li>
          </ul>
          <p>
            Een sessie van 90 minuten of langer kost naar verhouding meer (bijvoorbeeld 1,5 sessie of
            1,5 beurt voor anderhalf uur). Wat je precies betaalt of afboekt, staat altijd op je scherm
            vóór je bevestigt.
          </p>
        </Section>

        <Section title="3. Boeken en betalen">
          <p>
            Je boekt via je account op fittin.be. Vóór je bevestigt zie je het tijdstip, de duur, het
            aantal personen en het exacte bedrag. De knop waarmee je bevestigt vermeldt uitdrukkelijk
            dat er een betalingsverplichting aan vasthangt.
          </p>
          <p>
            Betalen gebeurt via Stripe (Bancontact of kaart). <strong>Je kaartgegevens komen nooit bij
            ons terecht</strong> — die gaan rechtstreeks naar Stripe. Een boeking is pas definitief zodra
            de betaling bevestigd is. Rond je de betaling niet af, dan houden we het tijdslot nog
            <strong> 15 minuten</strong> voor je vrij; daarna komt het automatisch weer beschikbaar voor
            iemand anders. Je kan hoogstens twee onbetaalde reserveringen tegelijk laten openstaan.
          </p>
          <p>
            Van elke betaling krijg je een bevestiging per e-mail. Een factuur kan je altijd opvragen
            via <Mail />.
          </p>
        </Section>

        <Section title="4. Geldigheid van je tegoeden">
          <p>
            Beurten van een beurtenkaart blijven <strong>6 maanden</strong> geldig vanaf de aankoop.
            De inbegrepen sessie van je abonnement blijft geldig tot je volgende verlenging. We
            verwittigen je per e-mail vóór tegoeden vervallen, en in je account zie je altijd hoeveel
            je nog hebt en tot wanneer.
          </p>
          <p>
            Verlopen tegoeden worden niet terugbetaald. Kon je door ziekte, blessure of een langere
            afwezigheid je beurten niet gebruiken? Laat het ons weten via <Mail /> — we zoeken dan
            samen een redelijke oplossing.
          </p>
        </Section>

        <Section title="5. Je abonnement: duur, verlenging en opzegging">
          <p>
            Het abonnement loopt <strong>van maand tot maand</strong> en verlengt automatisch, telkens
            voor één maand, zolang je het niet opzegt. Er is geen minimumduur en geen opzegvergoeding.
          </p>
          <p>
            <strong>Opzeggen kan op elk moment</strong> en is even eenvoudig als inschrijven: één klik in
            je account, onder <em>Mijn abonnement</em>. Je abonnement loopt dan gewoon door tot het einde
            van de periode die je al betaald hebt en verlengt daarna niet meer. Er wordt niets
            terugbetaald voor de resterende dagen van een lopende periode, maar je behoudt je voordeel
            tot de laatste dag. Opzeggen per e-mail via <Mail /> mag ook.
          </p>
          <p>
            Als een betaling mislukt, probeert Stripe automatisch opnieuw en verwittigen we je. Blijft
            de betaling uit, dan wordt het abonnement stopgezet en betaal je opnieuw het gewone
            sessietarief.
          </p>
        </Section>

        <Section title="6. Verplaatsen, annuleren en niet komen opdagen">
          <p>
            Je kan een geboekte sessie <strong>tot 6 uur vóór aanvang</strong> zelf verplaatsen naar een
            ander vrij moment, via je account. Daarna is verplaatsen niet meer mogelijk.
          </p>
          <p>
            Kom je niet opdagen of annuleer je te laat, dan wordt de sessie aangerekend. Dat is geen
            boete: je hebt een tijdslot vastgelegd dat wij voor niemand anders konden vrijgeven. Voor
            personal training gelden de afspraken die je met je coach maakt.
          </p>
          <p>
            Moeten wij een sessie annuleren (bijvoorbeeld door een technisch probleem of overmacht),
            dan krijg je je beurt of je geld volledig terug, naar keuze.
          </p>
        </Section>

        <Section title="7. Je herroepingsrecht">
          <p>
            Als consument heb je bij een aankoop op afstand normaal <strong>14 dagen</strong> bedenktijd.
            Voor onze diensten werkt dat als volgt.
          </p>
          <p className="rounded-2xl border border-borderc bg-white p-4">
            <strong className="text-brand">Een geboekte sessie op een vaste datum en uur.</strong>{" "}
            Hiervoor geldt het herroepingsrecht <strong>niet</strong>. De wet voorziet die uitzondering
            uitdrukkelijk voor vrijetijdsdiensten waarvoor een bepaalde datum of periode is afgesproken
            (art. VI.53, 12° van het Wetboek van economisch recht). Verplaatsen kan uiteraard wel, tot
            6 uur vooraf.
          </p>
          <p className="rounded-2xl border border-borderc bg-white p-4">
            <strong className="text-brand">Een beurtenkaart of een abonnement.</strong> Hiervoor heb je
            wél 14 dagen bedenktijd, te rekenen vanaf de dag na je aankoop. Vraag je bij de aankoop
            uitdrukkelijk om je tegoed of abonnement <em>meteen</em> te kunnen gebruiken, dan start de
            uitvoering onmiddellijk. Herroep je daarna binnen de 14 dagen, dan betalen we je terug wat
            je nog niet gebruikt hebt: de reeds gebruikte sessies rekenen we af aan het gewone tarief
            van € 15 per sessie, de rest krijg je terug. Heb je alles al opgebruikt, dan is er niets
            meer terug te betalen — daar stem je bij de aankoop uitdrukkelijk mee in.
          </p>
          <p>
            <strong>Hoe herroep je?</strong> Stuur een ondubbelzinnig bericht naar <Mail /> met je naam
            en wat je wil herroepen. Het wettelijke modelformulier gebruiken mag, maar hoeft niet. We
            bevestigen je herroeping en storten binnen <strong>14 dagen</strong> terug via hetzelfde
            betaalmiddel als waarmee je betaalde.
          </p>
        </Section>

        <Section title="8. Toegang en veiligheid">
          <p>
            De zaal is <strong>onbemand</strong> tijdens je sessie. Je krijgt ongeveer 5 minuten vóór
            aanvang een persoonlijke toegangscode die enkel tijdens jouw tijdslot werkt. Die code is
            persoonlijk: geef ze niet door en laat geen mensen binnen die niet bij jouw boeking horen.
          </p>
          <p>
            Je traint zelfstandig en op eigen verantwoordelijkheid. Twijfel je of sporten voor jou
            medisch verantwoord is, vraag dan eerst raad aan je arts. Voel je je onwel, stop dan. Bij
            nood bel je <strong>112</strong>. Volg steeds de{" "}
            <a href="/huisregels" className="font-semibold text-accentdark hover:underline">huisregels</a>.
          </p>
          <p>
            Merk je dat een toestel defect of onveilig is? Gebruik het niet en meld het meteen via je
            account of via <Mail />.
          </p>
        </Section>

        <Section title="9. Aansprakelijkheid">
          <p>
            Wij blijven aansprakelijk voor onze eigen fout of nalatigheid, en in het bijzonder voor
            schade aan je gezondheid of je leven die daaruit voortvloeit. Die aansprakelijkheid sluiten
            we niet uit en beperken we niet — dat mag ook niet. Concreet: wij zorgen voor een veilige
            zaal en goed onderhouden toestellen.
          </p>
          <p>
            Wij zijn niet aansprakelijk voor schade die het gevolg is van verkeerd of onoordeelkundig
            gebruik van de toestellen, van het negeren van instructies of huisregels, of van een
            medische toestand die je ons niet gemeld hebt en waarvan je wist of moest weten dat sporten
            afgeraden was. Voor persoonlijke bezittingen die je meebrengt, zijn wij niet aansprakelijk.
          </p>
          <p>
            Personal training gebeurt onder de verantwoordelijkheid van de coach met wie je die
            afspraak maakt.
          </p>
        </Section>

        <Section title="10. Gedrag, huisregels en toegang weigeren">
          <p>
            We verwachten dat je de zaal achterlaat zoals je ze wil aantreffen en dat je de huisregels
            volgt. Bij herhaalde ernstige inbreuken (materiaal beschadigen, je toegangscode doorgeven,
            anderen in gevaar brengen) kunnen we de toegang weigeren of je account afsluiten. We
            verwittigen je dan schriftelijk en betalen ongebruikte tegoeden terug, tenzij de inbreuk
            ons schade heeft berokkend.
          </p>
        </Section>

        <Section title="11. Klachten en geschillen">
          <p>
            Heb je een klacht? Laat het ons eerst zelf weten via <Mail />. We bevestigen je klacht
            binnen enkele dagen en zoeken samen een oplossing — in de praktijk is dat de snelste weg.
          </p>
          <p>
            Komen we er samen niet uit, dan kan je als consument gratis terecht bij de{" "}
            <strong>Consumentenombudsdienst</strong>, Koning Albert II-laan 8 bus 1, 1000 Brussel —{" "}
            <a href="https://consumentenombudsdienst.be" target="_blank" rel="noopener noreferrer" className="font-semibold text-accentdark hover:underline">consumentenombudsdienst.be</a>.
            Zij bemiddelen of verwijzen je door naar de juiste instantie.
          </p>
          <p>
            Op deze voorwaarden is het Belgisch recht van toepassing. Voor geschillen zijn de
            rechtbanken van het gerechtelijk arrondissement Oost-Vlaanderen, afdeling Gent, bevoegd,
            onverminderd je recht als consument om je te wenden tot de rechter van je woonplaats.
          </p>
        </Section>

        <Section title="12. Wijzigingen aan deze voorwaarden en aan de prijzen">
          <p>
            We kunnen deze voorwaarden en onze prijzen aanpassen. Wijzigingen die jou nadeliger maken,
            kondigen we <strong>minstens 30 dagen vooraf</strong> aan per e-mail. Ben je het er niet mee
            eens, dan kan je vóór de ingangsdatum kosteloos opzeggen en betalen we je ongebruikte
            tegoeden terug.
          </p>
          <p>
            Sessies die je al geboekt en betaald hebt, blijven altijd gelden aan de voorwaarden en de
            prijs van op het moment van je boeking.
          </p>
        </Section>

        <Section title="13. Je persoonsgegevens">
          <p>
            Hoe we met je gegevens omgaan, lees je in ons{" "}
            <a href="/privacy" className="font-semibold text-accentdark hover:underline">privacybeleid</a>.
            Wat er in je browser wordt opgeslagen, staat op onze{" "}
            <a href="/cookies" className="font-semibold text-accentdark hover:underline">cookiepagina</a>.
          </p>
        </Section>
      </div>
    </main>
  );
}
