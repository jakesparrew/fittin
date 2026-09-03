// Antwoord aan Upfront op de reactie van Tom (03-09-2026).
//
// Hun antwoord: Belgische partners mogen op het B2B-platform, minimum EUR 150 per bestelling,
// geen verzendkosten, en GEEN kortingscode voor leden — "jullie kopen zelf in en bieden aan
// binnen jullie locatie". Dat is groothandel, geen partnership: voorraadrisico en opslag bij ons.
//
// Wat de eigenaar wil (en wat deze mail vraagt): Upfront-producten verkopen ín de Fittin'-app,
// waarbij Upfront rechtstreeks naar het lid verstuurt. Dus dropshipping. De kernvraag is of die
// EUR 150 per ZENDING geldt — bij een losse bestelling van een lid (± EUR 40-70) is dat de
// breekpunt-vraag; al de rest is detail.
//
// Over het formulier: nagekeken op 03-09-2026 in een echte browser. De JavaScript-fout die wij
// aanwezen (d.isImmediatePropagationStopped) is verdwenen; enkel de losse SyntaxError staat er
// nog. Bewust NIET doorgeklikt met echte gegevens — dat doen we bij de echte aanmelding, zodat
// er geen half ingevulde registratie in hun systeem belandt.
//
//   node --env-file=.env.local scripts/mail-upfront-2.mjs         → test naar de eigenaar
//   node --env-file=.env.local scripts/mail-upfront-2.mjs --send  → echt naar Upfront
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Fittin' <info@fittin.be>";
const REPLY_TO = "info@fittin.be";
const TO = "zakelijk@upfront.nl";
const TEST_TO = "gaetanjansseune@gmail.com";
const SUBJECT = "Re: Partneraanvraag Fittin' — verkoop via onze app, verzending door jullie";

const VRAGEN = [
  "Kunnen jullie leveren op een <strong>ander adres dan het onze</strong>, dus rechtstreeks naar de eindklant?",
  "Geldt de <strong>minimumbestelwaarde van &euro;&nbsp;150 per zending</strong>? Een losse bestelling van een lid ligt eerder rond &euro;&nbsp;40 &agrave; &euro;&nbsp;70. Kan die drempel per periode gelden (bijvoorbeeld per maand, over alle bestellingen samen), of komen er dan verzendkosten bij die wij gewoon doorrekenen?",
  "Gaat het pakket eruit <strong>als Upfront</strong>, of is neutrale verzending mogelijk? Beide is voor ons prima &mdash; we willen het enkel juist communiceren naar onze leden.",
  "Werken jullie met een <strong>productfeed of API</strong>, of plaatsen we elke bestelling handmatig op het B2B-platform? Voor een handvol bestellingen per week is handmatig geen probleem; we willen het gewoon weten voor we iets bouwen.",
  "Waar vinden we de <strong>zakelijke prijzen en de geadviseerde verkoopprijs</strong>? Dat bepaalt of hier een werkbare marge op zit.",
];

const TEXT = `Beste Tom

Bedankt voor het snelle antwoord, en fijn dat jullie het formulier meteen hebben aangepakt. We hebben de pagina vandaag opnieuw bekeken: de JavaScript-fout die wij aanwezen (d.isImmediatePropagationStopped) is inderdaad verdwenen.

Voor we ons aanmelden willen we een ding helder krijgen, want het bepaalt of dit voor ons werkt.

Wat wij graag zouden doen: Upfront-producten aanbieden in onze eigen app - dat is waar onze leden hun sessies boeken, en waar hun coach hun trainingsschema klaarzet. Het lid bestelt daar, wij plaatsen de bestelling bij jullie, en jullie versturen rechtstreeks naar het adres van dat lid.

Wij nemen dus zelf geen voorraad in huis. Dat is bewust: onze zaal is compact en heeft geen stockruimte. Wat we wel hebben is zeven coaches die hun klanten dagelijks over voeding adviseren, en een app waar die leden sowieso al elke week in zitten.

Vandaar vijf vragen:

1. Kunnen jullie leveren op een ander adres dan het onze, dus rechtstreeks naar de eindklant?

2. Geldt de minimumbestelwaarde van EUR 150 per zending? Een losse bestelling van een lid ligt eerder rond EUR 40 a EUR 70. Kan die drempel per periode gelden (bijvoorbeeld per maand, over alle bestellingen samen), of komen er dan verzendkosten bij die wij gewoon doorrekenen?

3. Gaat het pakket eruit als Upfront, of is neutrale verzending mogelijk? Beide is voor ons prima - we willen het enkel juist communiceren naar onze leden.

4. Werken jullie met een productfeed of API, of plaatsen we elke bestelling handmatig op het B2B-platform? Voor een handvol bestellingen per week is handmatig geen probleem; we willen het gewoon weten voor we iets bouwen.

5. Waar vinden we de zakelijke prijzen en de geadviseerde verkoopprijs? Dat bepaalt of hier een werkbare marge op zit.

Kan dit model niet bij jullie, dan horen we dat ook graag en zonder omwegen. Dan bekijken we of een kleine basisvoorraad voor in de zaal zelf zinvol is - maar dan weten we tenminste waar we aan toe zijn voor we ons aanmelden.

Met vriendelijke groeten,

Ran Knockaert
Bestuurder, De Wereld Draait Door VZW - Fittin'
Aannemersstraat 186, 9040 Gent (Belgie)
BE 0772.565.606
info@fittin.be | fittin.be`;

const p = (t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#22194F">${t}</p>`;
const HTML = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#22194F">
${p("Beste Tom")}
${p("Bedankt voor het snelle antwoord, en fijn dat jullie het formulier meteen hebben aangepakt. We hebben de pagina vandaag opnieuw bekeken: de JavaScript-fout die wij aanwezen (<code>d.isImmediatePropagationStopped</code>) is inderdaad verdwenen.")}
${p("Voor we ons aanmelden willen we &eacute;&eacute;n ding helder krijgen, want het bepaalt of dit voor ons werkt.")}
${p("Wat wij graag zouden doen: <strong>Upfront-producten aanbieden in onze eigen app</strong> &mdash; dat is waar onze leden hun sessies boeken, en waar hun coach hun trainingsschema klaarzet. Het lid bestelt daar, wij plaatsen de bestelling bij jullie, en <strong>jullie versturen rechtstreeks naar het adres van dat lid</strong>.")}
${p("Wij nemen dus zelf geen voorraad in huis. Dat is bewust: onze zaal is compact en heeft geen stockruimte. Wat we w&eacute;l hebben is zeven coaches die hun klanten dagelijks over voeding adviseren, en een app waar die leden sowieso al elke week in zitten.")}
${p("Vandaar vijf vragen:")}
<ol style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#22194F">
${VRAGEN.map((v) => `<li style="margin-bottom:10px">${v}</li>`).join("\n")}
</ol>
${p("Kan dit model niet bij jullie, dan horen we dat ook graag en zonder omwegen. Dan bekijken we of een kleine basisvoorraad voor in de zaal zelf zinvol is &mdash; maar dan weten we tenminste waar we aan toe zijn v&oacute;&oacute;r we ons aanmelden.")}
${p("Met vriendelijke groeten,")}
${p("<strong>Ran Knockaert</strong><br>Bestuurder, De Wereld Draait Door VZW &mdash; Fittin&rsquo;<br>Aannemersstraat 186, 9040 Gent (Belgi&euml;)<br>BE 0772.565.606<br><a href=\"mailto:info@fittin.be\" style=\"color:#1a7d34\">info@fittin.be</a> &middot; <a href=\"https://fittin.be\" style=\"color:#1a7d34\">fittin.be</a>")}
</div>`;

const live = process.argv.includes("--send");
const to = live ? TO : TEST_TO;
const res = await resend.emails.send({ from: FROM, to, replyTo: REPLY_TO, subject: SUBJECT, text: TEXT, html: HTML });
if (res?.error) {
  console.error("mislukt:", res.error);
  process.exit(1);
}
console.log(`${live ? "VERSTUURD naar" : "TEST naar"} ${to} — id ${res?.data?.id}`);
