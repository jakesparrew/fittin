export const metadata = {
  title: "Algemene voorwaarden | Fittin'",
  description: "De algemene voorwaarden van Fittin' (De Wereld Draait Door VZW): sessies, beurtenkaarten, abonnement, annuleren, verplaatsen en je herroepingsrecht.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/voorwaarden` },
};

const Section = ({ title, children }) => (
  <section className="mt-8">
    <h2 className="text-xl font-black text-brand">{title}</h2>
    <div className="mt-3 space-y-3 leading-relaxed text-brand/70">{children}</div>
  </section>
);

export default function Voorwaarden() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Voorwaarden</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">Algemene voorwaarden</h1>
        <p className="mt-3 text-sm text-brand/50">Laatst bijgewerkt: juli 2026</p>

        <p className="mt-6 leading-relaxed text-brand/70">
          Deze voorwaarden gelden voor elke boeking, aankoop en het gebruik van Fittin&rsquo;. Door een
          sessie te boeken of een beurtenkaart/abonnement te kopen, ga je ermee akkoord.
        </p>

        <Section title="1. Wie zijn we?">
          <p>
            Fittin&rsquo; is een privégym uitgebaat door <strong>De Wereld Draait Door VZW</strong>,
            Aannemersstraat 186, 9040 Gent, ondernemingsnummer <strong>BE 0772.565.606</strong>.
            Contact: <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>.
          </p>
        </Section>

        <Section title="2. Sessies & prijzen">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Een <strong>losse sessie</strong> kost € 15 en duurt 1 uur, voor 1 tot 4 personen. Er is geen lidgeld — je betaalt enkel voor je gereserveerde tijd.</li>
            <li>Een <strong>10-beurtenkaart</strong> kost € 150 en geeft recht op 11 sessies. De beurtenkaart is <strong>6 maanden geldig</strong> vanaf aankoop; niet-gebruikte sessies vervallen daarna.</li>
            <li>Het <strong>abonnement</strong> kost € 12/maand: één sessie is inbegrepen (die vervalt op het einde van de kalendermaand), daarna boek je elke sessie aan € 12. Het abonnement is maandelijks opzegbaar via je account of Stripe-klantportaal; bij opzeg loopt het tot het einde van de lopende betaalperiode.</li>
            <li>Je eerste sessie is gratis (eenmalig per account).</li>
          </ul>
        </Section>

        <Section title="3. Betaling">
          <p>
            Betalingen verlopen veilig via Stripe (Bancontact, kaart). Je kaartgegevens worden nooit
            door ons bewaard. Een boeking is pas definitief wanneer de betaling bevestigd is; een
            onbetaalde reservering wordt na ± 35 minuten automatisch vrijgegeven.
          </p>
        </Section>

        <Section title="4. Verplaatsen & annuleren">
          <p>
            Je kan een geboekte sessie <strong>tot 6 uur vóór aanvang</strong> zelf verplaatsen via je
            account. Sessies worden niet terugbetaald bij no-show of laattijdig annuleren — je betaalt
            immers voor de gereserveerde tijd, niet voor je aanwezigheid. Voor personal training geldt
            wat je met je coach afspreekt.
          </p>
        </Section>

        <Section title="5. Herroepingsrecht">
          <p>
            Voor diensten met een <strong>vaste uitvoeringsdatum</strong> (een geboekte sessie op een
            gekozen dag en uur) geldt het wettelijke herroepingsrecht van 14 dagen <strong>niet</strong>
            (art. VI.53 WER — vrijetijdsdiensten met een bepaalde datum). Voor beurtenkaarten en
            abonnementen die nog niet zijn aangesproken, kan je binnen 14 dagen na aankoop kosteloos
            herroepen door te mailen naar <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>; reeds gebruikte
            sessies worden dan verrekend aan de losse prijs (€ 15).
          </p>
        </Section>

        <Section title="6. Toegang & veiligheid">
          <p>
            De gym is <strong>onbemand</strong> tijdens je sessie. Je krijgt een persoonlijke
            toegangscode die enkel tijdens jouw tijdslot werkt. Je bent verantwoordelijk voor een
            veilig gebruik van de toestellen en traint op eigen risico. Bij nood bel je <strong>112</strong>.
            Volg steeds de <a href="/huisregels" className="font-semibold text-accentdark hover:underline">huisregels</a>.
          </p>
        </Section>

        <Section title="7. Aansprakelijkheid">
          <p>
            Fittin&rsquo; is niet aansprakelijk voor blessures of schade die voortvloeien uit onoordeelkundig
            gebruik van de zaal of de toestellen. Train binnen je mogelijkheden en stop bij pijn of onwel
            zijn. Meld defecten via <a href="mailto:info@fittin.be" className="font-semibold text-accentdark hover:underline">info@fittin.be</a>.
          </p>
        </Section>

        <Section title="8. Persoonsgegevens">
          <p>
            We verwerken je gegevens volgens ons <a href="/privacy" className="font-semibold text-accentdark hover:underline">privacybeleid</a>.
          </p>
        </Section>

        <Section title="9. Geschillen">
          <p>
            Op deze voorwaarden is het Belgisch recht van toepassing. Bij een geschil zijn de rechtbanken
            van het gerechtelijk arrondissement Oost-Vlaanderen, afdeling Gent, bevoegd. Je kan ook terecht
            bij het Europese ODR-platform (ec.europa.eu/consumers/odr).
          </p>
        </Section>
      </div>
    </main>
  );
}
