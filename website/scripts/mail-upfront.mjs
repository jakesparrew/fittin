// Partneraanvraag bij Upfront (sportvoeding, upfront.nl) — hun B2B-tak richt zich expliciet op
// "sportscholen, verenigingen en clubs", dus Fittin' zit in hun doelgroep.
//
// De mail vertrekt naar zakelijk@upfront.nl in plaats van via hun aanmeldformulier, omdat de knop
// "Aanmelden" op https://upfront.nl/pages/zakelijk aantoonbaar niets doet. Nagemeten op 29-08-2026
// in een echte browser: Klaviyo laadt volledig (37 verzoeken, _klOnsite aanwezig, formulier door
// Klaviyo gerenderd), maar een klik levert géén submit-event, géén fetch/XHR en géén
// validatieboodschap op. Op de pagina staan twee JS-fouten. Dat melden we erbij — het verklaart
// waarom we mailen en het is meteen nuttig voor hen.
//
//   node --env-file=.env.local scripts/mail-upfront.mjs         → test naar de eigenaar
//   node --env-file=.env.local scripts/mail-upfront.mjs --send  → echt naar Upfront
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Fittin' <info@fittin.be>";
const REPLY_TO = "info@fittin.be";
const TO = "zakelijk@upfront.nl";
const TEST_TO = "gaetanjansseune@gmail.com";
const SUBJECT = "Partneraanvraag Fittin' (privégym Gent) — en een melding over jullie aanmeldformulier";

const TEXT = `Beste

Wij wilden ons aanmelden als zakelijke partner via het formulier op upfront.nl/pages/zakelijk, maar de knop "Aanmelden" doet niets. Vandaar deze mail rechtstreeks — onderaan staan de technische details, voor het geval jullie webbouwer daar iets aan heeft.

Eerst waarover het gaat.

Wij zijn Fittin', een privégym in Gent (Sint-Amandsberg). Bij ons boekt een lid de volledige zaal voor zichzelf: geen lidgeld, je betaalt enkel voor je tijd. Vandaag zijn we met 83 leden en 7 coaches, goed voor zo'n 120 sessies per maand.

We zouden Upfront graag bij onze leden aanbieden. Twee vragen daarbij:

1. Wij zitten in Belgie. Gelden jullie standaardvoorwaarden (bestellen vanaf EUR 150 zonder transportkost, levering in 1 a 2 werkdagen) ook voor Belgische partners?

2. Naast verkoop in de zaal: werken jullie ook met een kortingscode voor leden, waarbij zij rechtstreeks bij jullie bestellen? Onze zaal is compact, dus voorraad in huis nemen is voor ons een grotere stap dan voor een klassieke sportschool - terwijl we wel zeven coaches hebben die hun klanten dagelijks over voeding adviseren. Kan het allebei, dan doen we graag allebei.

---

Over het formulier (nagekeken op 29 augustus 2026, in een gewone browser):

Op https://upfront.nl/pages/zakelijk reageert de knop "Aanmelden" niet. Er vertrekt geen enkel netwerkverzoek en er verschijnt ook geen foutmelding of validatiebericht - de knop lijkt gewoon dood. Het gaat om een Klaviyo-formulier, en de Klaviyo-scripts laden wel degelijk correct.

In de console van de pagina staan twee JavaScript-fouten:

  Uncaught SyntaxError: Invalid or unexpected token
  Uncaught TypeError: d.isImmediatePropagationStopped is not a function

Die tweede is een bekend patroon: een script van het thema behandelt een klik-event als een jQuery-event terwijl het dat niet is, waardoor de afhandeling afbreekt voordat Klaviyo het formulier kan versturen. Goed mogelijk dat jullie zo aanmeldingen mislopen zonder het te merken.

Met vriendelijke groeten,

Ran Knockaert
Bestuurder, De Wereld Draait Door VZW - Fittin'
Aannemersstraat 186, 9040 Gent (Belgie)
BE 0772.565.606
info@fittin.be | fittin.be`;

const p = (t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#22194F">${t}</p>`;
const HTML = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#22194F">
${p("Beste")}
${p('Wij wilden ons aanmelden als zakelijke partner via het formulier op <a href="https://upfront.nl/pages/zakelijk" style="color:#1a7d34">upfront.nl/pages/zakelijk</a>, maar de knop <strong>&ldquo;Aanmelden&rdquo; doet niets</strong>. Vandaar deze mail rechtstreeks &mdash; onderaan staan de technische details, voor het geval jullie webbouwer daar iets aan heeft.')}
${p("Eerst waarover het gaat.")}
${p("Wij zijn <strong>Fittin&rsquo;</strong>, een priv&eacute;gym in Gent (Sint-Amandsberg). Bij ons boekt een lid de volledige zaal voor zichzelf: geen lidgeld, je betaalt enkel voor je tijd. Vandaag zijn we met <strong>83 leden</strong> en <strong>7 coaches</strong>, goed voor zo&rsquo;n <strong>120 sessies per maand</strong>.")}
${p("We zouden Upfront graag bij onze leden aanbieden. Twee vragen daarbij:")}
<ol style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#22194F">
<li style="margin-bottom:10px">Wij zitten in <strong>Belgi&euml;</strong>. Gelden jullie standaardvoorwaarden (bestellen vanaf &euro;&nbsp;150 zonder transportkost, levering in 1 &agrave; 2 werkdagen) ook voor Belgische partners?</li>
<li>Naast verkoop in de zaal: werken jullie ook met een <strong>kortingscode voor leden</strong>, waarbij zij rechtstreeks bij jullie bestellen? Onze zaal is compact, dus voorraad in huis nemen is voor ons een grotere stap dan voor een klassieke sportschool &mdash; terwijl we wel zeven coaches hebben die hun klanten dagelijks over voeding adviseren. Kan het allebei, dan doen we graag allebei.</li>
</ol>
<hr style="border:0;border-top:1px solid #E6E4F0;margin:22px 0">
${p("<strong>Over het formulier</strong> (nagekeken op 29 augustus 2026, in een gewone browser):")}
${p("Op upfront.nl/pages/zakelijk reageert de knop &ldquo;Aanmelden&rdquo; niet. Er vertrekt <strong>geen enkel netwerkverzoek</strong> en er verschijnt ook geen foutmelding of validatiebericht &mdash; de knop lijkt gewoon dood. Het gaat om een Klaviyo-formulier, en de Klaviyo-scripts laden wel degelijk correct.")}
${p("In de console van de pagina staan twee JavaScript-fouten:")}
<pre style="background:#F5F6FA;border:1px solid #E6E4F0;border-radius:8px;padding:12px;font-size:13px;color:#22194F;white-space:pre-wrap;margin:0 0 14px">Uncaught SyntaxError: Invalid or unexpected token
Uncaught TypeError: d.isImmediatePropagationStopped is not a function</pre>
${p("Die tweede is een bekend patroon: een script van het thema behandelt een klik-event als een jQuery-event terwijl het dat niet is, waardoor de afhandeling afbreekt voordat Klaviyo het formulier kan versturen. Goed mogelijk dat jullie zo aanmeldingen mislopen zonder het te merken.")}
${p("Met vriendelijke groeten,")}
${p("<strong>Ran Knockaert</strong><br>Bestuurder, De Wereld Draait Door VZW &mdash; Fittin&rsquo;<br>Aannemersstraat 186, 9040 Gent (Belgi&euml;)<br>BE 0772.565.606<br><a href=\"mailto:info@fittin.be\" style=\"color:#1a7d34\">info@fittin.be</a> &middot; <a href=\"https://fittin.be\" style=\"color:#1a7d34\">fittin.be</a>")}
</div>`;

const live = process.argv.includes("--send");
const to = live ? TO : TEST_TO;
const res = await resend.emails.send({
  from: FROM, to, ...(live ? { bcc: REPLY_TO } : {}), replyTo: REPLY_TO,
  subject: live ? SUBJECT : `[TEST] ${SUBJECT}`, text: TEXT, html: HTML,
});
if (res?.error) { console.error("VERZENDEN MISLUKT:", res.error?.message || JSON.stringify(res.error)); process.exit(1); }
console.log(`${live ? "VERZONDEN naar " + TO : "TESTMAIL"} naar ${to} — id ${res?.data?.id}`);
