// Uitleg over facturatie en btw aan de eigenaar (info@fittin.be), gevraagd op 04-09-2026.
//
// Aanleiding: er liepen twee factuurreeksen naast elkaar (Stripe én Fittin') en de owner zag door
// het bos de bomen niet meer. Alles wat hierin staat is nagekeken op de echte databank en de echte
// Stripe-configuratie; de wijzigingen zitten in commits 3b60374, c7f7951, abebbc5 en fb8a036.
//
//   node --env-file=.env.local scripts/mail-facturen-uitleg.mjs         → test naar de ontwikkelaar
//   node --env-file=.env.local scripts/mail-facturen-uitleg.mjs --send  → echt naar info@fittin.be
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Fittin' <info@fittin.be>";
const TO = "info@fittin.be";
const TEST_TO = "gaetanjansseune@gmail.com";
const SUBJECT = "Facturen en btw — hoe het nu werkt";

const P = (t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#22194F">${t}</p>`;
const H = (t) => `<h2 style="margin:28px 0 10px;font-size:16px;color:#22194F">${t}</h2>`;
const LI = (items) =>
  `<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#22194F">${items
    .map((i) => `<li style="margin:0 0 8px">${i}</li>`)
    .join("")}</ul>`;
const OL = (items) =>
  `<ol style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#22194F">${items
    .map((i) => `<li style="margin:0 0 6px">${i}</li>`)
    .join("")}</ol>`;
const KADER = (kleur, achtergrond, inhoud) =>
  `<div style="border:1px solid ${kleur};background:${achtergrond};border-radius:10px;padding:14px 18px;margin:0 0 16px">${inhoud}</div>`;

const html = `<div style="font-family:Lato,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px 22px;background:#ffffff">
  <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#B2ADC2;margin:0 0 6px">Fittin&rsquo; &middot; 4 september 2026</p>
  <h1 style="margin:0 0 18px;font-size:24px;color:#22194F">Facturen en btw</h1>

  ${P("Dag Ran,")}
  ${P(
    "Je vroeg hoe het nu precies zit met de facturen van de coaches, met &ldquo;Ik koop als bedrijf&rdquo; bij Stripe, en met de facturen die het platform zelf maakt. Er liepen inderdaad <strong>twee reeksen naast elkaar</strong>. Dat is opgelost. Hieronder in het kort hoe het nu werkt en wat jij nog moet doen."
  )}

  ${H("De drie stukken")}
  ${OL([
    "<strong>Stripe is de kassa.</strong> Het neemt het geld aan. Het vinkje &ldquo;Ik koop als bedrijf&rdquo; dat jij aanzette, vraagt bedrijfsnaam en btw-nummer. <strong>Dat blijft aan</strong> &mdash; het verzamelt alleen informatie.",
    "<strong>Stripe maakte daarnaast ook zijn eigen factuur.</strong> Automatisch, maar onbruikbaar: Stripe weet niet dat jullie 6% btw rekenen, dus daar stond enkel &ldquo;&euro;&nbsp;12,00&rdquo; op zonder btw-regel. <strong>Dat heb ik uitgezet.</strong> Dat was de dubbele.",
    "<strong>Fittin&rsquo; maakt de echte factuur.</strong> Met de vzw-gegevens, de 6%-splitsing, een doorlopend nummer, en de bedrijfsnaam + btw-nummer van de klant. Wat de klant bij de kassa invult, komt daar nu automatisch in terecht.",
  ])}

  ${KADER(
    "#E0A63A",
    "#FFF4DC",
    `<p style="margin:0;font-size:14px;line-height:1.6;color:#22194F"><strong>&Eacute;&eacute;n uitzondering:</strong> de maandabonnementen van &euro;&nbsp;12 factureert Stripe altijd zelf. Dat kan technisch niet uit, en dat is ook prima &mdash; vast bedrag, elke maand hetzelfde. Al de rest factureert Fittin&rsquo;.</p>`
  )}

  ${H("Wat een coach vanaf nu meemaakt")}
  ${OL([
    "Koopt sessietegoed, vinkt bij de kassa &ldquo;Ik koop als bedrijf&rdquo; aan en vult bedrijf + btw-nummer in.",
    "Betaalt. Krijgt van Stripe een gewoon <strong>betaalbewijs</strong> &mdash; geen factuur meer.",
    "Zijn gegevens staan meteen in zijn Fittin&rsquo;-profiel.",
    "Gaat naar <strong>Coach &rarr; Betalingen &rarr; &ldquo;Factuur&rdquo;</strong> en heeft zijn volledige factuur.",
  ])}
  ${P(
    "Jij ziet exact dezelfde factuur onder <strong>Beheer &rarr; Financi&euml;n</strong>, rechts in elke rij. Die knop stond er tot gisteren alleen op de pagina Betalingen; nu op allebei."
  )}

  ${H("Wat jij nog moet doen")}
  ${P(
    "Drie coaches kochten al tegoed <em>v&oacute;&oacute;r</em> dit werkte, en hebben dus nog geen btw-gegevens in hun profiel:"
  )}
  ${LI([
    "Jan Matthys &mdash; janmatthyss@icloud.com",
    "Sophie &mdash; sophie.debloudts@gmail.com",
    "Thomas Lesage &mdash; thomas.lesage10@hotmail.com",
  ])}
  ${P(
    "Stuur ze &eacute;&eacute;n berichtje: <em>&ldquo;Vul je bedrijfsnaam en btw-nummer in bij Coach &rarr; Mijn profiel, dan kan je je factuur downloaden bij Betalingen.&rdquo;</em> Of vraag het hen en vul jij het in bij Beheer &rarr; Coaches."
  )}
  ${KADER(
    "#5FDA6B",
    "#E8F8EB",
    `<p style="margin:0;font-size:14px;line-height:1.6;color:#22194F"><strong>Belangrijk:</strong> de factuur leest die gegevens uit op het moment dat je ze opent. Vult een coach vandaag zijn btw-nummer in, dan is zijn factuur van juli daarna ook meteen compleet. Gewoon opnieuw openen &mdash; het nummer blijft hetzelfde. Je hoeft dus <strong>nooit</strong> iets manueel over te maken.</p>`
  )}
  ${P("TDW Personal Training en Jelle Vercruysse hebben het al ingevuld; die kunnen vandaag al downloaden.")}
  ${P(
    "Voor nieuwe coaches lost het zichzelf op: op hun dashboard staat nu &ldquo;Vul je facturatiegegevens in&rdquo; als stap in de startlijst, v&oacute;&oacute;r &ldquo;Koop je eerste sessietegoed&rdquo;."
  )}

  ${H("In Stripe zelf hoef je niets te doen")}
  ${P(
    "Het vinkje dat je aanzette is juist en blijft staan. Stripe blijft betaalbewijzen sturen. Wil je later toch alles v&oacute;&oacute;r Stripe laten factureren, dan moet daar eerst een tarief van 6% ingesteld worden &mdash; anders staat er op geen enkele factuur btw vermeld. Zeg het als je die kant op wil."
  )}

  ${H("Wat er precies veranderd is")}
  ${LI([
    "Het btw-nummer dat een klant bij de kassa invult, wordt nu <strong>overgenomen in zijn profiel</strong>. Dat gebeurde niet &mdash; daarom moest iedereen het twee keer intypen en bleven facturen leeg.",
    "<strong>Stripe maakt geen eigen factuur meer</strong> bij eenmalige betalingen. Dat was de dubbele reeks. Betaalbewijzen blijven wel komen.",
    "De knop <strong>&ldquo;Factuur&rdquo;</strong> staat nu ook op Beheer &rarr; Financi&euml;n, in elke rij van de transactielijst. Hij stond alleen op Betalingen, waardoor je hem niet vond.",
    "Op het coachdashboard staat <strong>&ldquo;Vul je facturatiegegevens in&rdquo;</strong> als stap in de startlijst, v&oacute;&oacute;r het kopen van tegoed. En bij het aankoopblok zelf staat nu de vraag om het btw-nummer.",
    "Twee <strong>privacygaten gedicht</strong> die ik daags voordien zelf had gemaakt: de priv&eacute;notities van coaches en de cv&rsquo;s van sollicitanten stonden open voor alle coaches in plaats van alleen voor jou. Er stond nog niets in, dus er is niets gelekt.",
  ])}
  ${P(
    "<span style=\"color:#6b6685;font-size:13px\">Alles is getest: 236 tests, een volledige productiebuild, en de betalingen zijn nagekeken op de echte databank &mdash; 65 betalingen in 30 dagen, allemaal geslaagd, geen enkele mislukte mail.</span>"
  )}

  ${H("Eén vraag voor je boekhouder")}
  ${P(
    "De <strong>aanbrengvergoeding</strong> (&euro;&nbsp;6 extra per sessie met een klant die jij doorgeeft) is nieuw. Wij boeken die als een <em>hoger zaaltarief</em> voor aangebrachte klanten &mdash; &euro;&nbsp;18 in plaats van &euro;&nbsp;12 &mdash; en uitdrukkelijk niet als een commissie op de omzet van de coach. Voor een vzw is dat fiscaal een ander verhaal. Laat dat bevestigen; het verandert alleen de bewoording op de site, niet hoe het werkt."
  )}

  <p style="margin:24px 0 0;font-size:15px;color:#22194F">Groeten,<br>Gaetan</p>
</div>`;

const send = process.argv.includes("--send");
const to = send ? TO : TEST_TO;
const res = await resend.emails.send({ from: FROM, to, replyTo: "info@fittin.be", subject: SUBJECT, html });
if (res.error) {
  console.error("mislukt:", res.error);
  process.exit(1);
}
console.log(`verstuurd naar ${to} — id ${res.data?.id}`);
