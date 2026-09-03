// Uitleg van de aanbrengvergoeding aan de eigenaar (info@fittin.be), gevraagd op 03-09-2026:
// "stuur de uitleg zodat de eigenaar het begrijpt — niet te lang, maar met de regels en hoe je het
// gebouwd hebt."
//
// Bewust kort en in gewone taal. Alles wat hierin staat, is nagekeken op de echte databank; de
// migraties 0152 en 0153 zijn toegepast en de trigger is end-to-end getest in een transactie die
// daarna volledig is teruggedraaid (er staat geen testdata in productie).
//
//   node --env-file=.env.local scripts/mail-aanbreng-uitleg.mjs         → test naar de ontwikkelaar
//   node --env-file=.env.local scripts/mail-aanbreng-uitleg.mjs --send  → echt naar info@fittin.be
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Fittin' <info@fittin.be>";
const TO = "info@fittin.be";
const TEST_TO = "gaetanjansseune@gmail.com";
const SUBJECT = "Aanbrengvergoeding staat klaar — hoe het werkt";

const P = (t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#22194F">${t}</p>`;
const H = (t) => `<h2 style="margin:26px 0 10px;font-size:16px;color:#22194F">${t}</h2>`;
const LI = (items) =>
  `<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#22194F">${items
    .map((i) => `<li style="margin:0 0 6px">${i}</li>`)
    .join("")}</ul>`;

const html = `<div style="font-family:Lato,Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px 22px;background:#ffffff">
  <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#B2ADC2;margin:0 0 6px">Fittin&rsquo; &middot; 3 september 2026</p>
  <h1 style="margin:0 0 18px;font-size:24px;color:#22194F">Aanbrengvergoeding</h1>

  ${P("Dag Ran,")}
  ${P(
    "De aanbrengvergoeding staat in de app. Hieronder in het kort de regel, wat er nadrukkelijk <strong>niet</strong> verandert, en hoe het gebouwd is."
  )}

  ${H("De regel")}
  ${P(
    "Geef jij een klant door aan een coach, dan kost <strong>elke boeking</strong> die die coach met die klant maakt <strong>een halve beurt extra</strong> &mdash; &euro;&nbsp;6 bovenop de gewone &euro;&nbsp;12 zaalhuur. Per boeking, niet per uur: een sessie van twee uur kost 2 beurten zaal + 0,5 beurt aanbreng. Zegt de coach de sessie af, dan krijgt hij die halve beurt automatisch terug."
  )}

  ${H("Wat niet verandert")}
  ${LI([
    "<strong>De klant betaalt geen cent meer.</strong> Losse sessie blijft &euro;&nbsp;15, met kaart of abonnement &euro;&nbsp;12. De aanbreng bestaat alleen in het tegoedboek van de coach; de boekingsflow van een lid is technisch niet aangeraakt.",
    "<strong>Eigen klanten van een coach blijven &euro;&nbsp;12.</strong> Alleen klanten die jij doorgeeft en die de coach zelf aanvaardde, kosten meer.",
    "<strong>Zonder aanvaarding gebeurt er niets.</strong> De coach moet de klant in zijn app aanvaarden; dat is de afspraak. Weigert hij, dan komt de aanvraag terug bij jou en wordt er niets aangerekend.",
  ])}

  ${H("Hoe het loopt")}
  ${LI([
    "Een intake komt binnen bij <strong>Beheer &rarr; Inbox</strong>. Daar staat nu een knop <em>Geef door aan coach</em>. Je kiest de coach, ziet het tarief (&euro;&nbsp;6) en kan het voor deze ene klant aanpassen of een plafond zetten.",
    "De coach krijgt een melding en een mail met het tarief erin, en aanvaardt of weigert bij <em>Mijn clienten</em>.",
    "Heeft de klant nog geen account, dan hangt de doorgave aan zijn e-mailadres en koppelt ze zichzelf zodra hij zich aanmeldt.",
    "Elke bevestigde sessie van die coach met die klant boekt automatisch <em>aanbreng &minus;0,5</em> in zijn tegoed. Hij ziet dat vooraf in het boekingsscherm en achteraf in zijn tegoedoverzicht, met de naam erbij.",
    "Staat zijn tegoed te laag voor sessie + aanbreng samen, dan kan hij niet boeken &mdash; net zoals nu al bij een leeg tegoed.",
  ])}

  ${H("Waar jij het volgt")}
  ${P(
    "Nieuw menu-item <strong>Beheer &rarr; Aanbreng</strong>. Daar staat alles: lopende doorgaven, wie nog moet aanvaarden, hoeveel elke doorgave tot nu opbracht, en de knoppen om een tarief te wijzigen, een doorgave te stoppen of een beurt kwijt te schelden. Het standaardtarief pas je daar ook aan."
  )}

  ${H("Wat als een coach zijn klant niet invult")}
  ${P(
    "Dat is de zwakke plek van elk systeem als dit, dus die is apart aangepakt. Zodra een coach zijn eerste aangebrachte klant aanvaardt, moet hij bij <strong>elke</strong> boeking zeggen met wie hij traint &mdash; een naam volstaat voor iemand die niet in het systeem staat. Die schakelaar staat per coach en jij kan hem aan- en uitzetten."
  )}
  ${P(
    "Bovenaan het Aanbreng-scherm staat een lijstje <strong>Te controleren</strong>: sessies zonder gekoppelde klant bij een coach die op dat moment een lopende doorgave had. Staat er een naam die lijkt op een aangebrachte klant, dan komt die rij bovenaan met de knop <em>Reken &euro;&nbsp;6 aan</em>. Je kan ook <em>Geen aanbreng</em> klikken; dan verdwijnt de rij. Het systeem rekent hier nooit zelf iets aan &mdash; een coach mag op datzelfde uur met een eigen klant trainen, en software die dat zelf beslist, richt meer schade aan dan het gat dat ze dicht."
  )}

  ${H("Nog dit")}
  ${LI([
    "Coaches kunnen nu in hun profiel aanzetten of ze <strong>nieuwe klanten aannemen</strong>. Staat dat uit, dan verdwijnen ze uit de keuzelijst bij een gratis intake en kan niemand hen via de site aanvragen; bestaande klanten en sessies blijven gewoon lopen.",
    "De teksten op <em>coach worden</em> en in de voorwaarden zijn aangepast: &euro;&nbsp;12 voor je eigen klanten, &euro;&nbsp;18 voor klanten die Fittin&rsquo; aanbrengt, vooraf te aanvaarden.",
    "<strong>&Eacute;&eacute;n ding voor jou:</strong> laat je boekhouder dit even bevestigen. We rekenen het aan als een <em>hoger zaaltarief</em> voor aangebrachte klanten, niet als een commissie op de omzet van de coach. Dat is voor een VZW fiscaal een ander verhaal, en het bepaalt de bewoording op de site &mdash; niet de techniek.",
  ])}

  ${P(
    "<span style=\"color:#6b6685;font-size:13px\">Technisch: migraties 0152 en 0153 op de productiedatabank. De kost hangt aan de boeking (databasetrigger), niet aan &eacute;&eacute;n knop &mdash; zo tellen ook sessies mee die de coach pas achteraf aan een klant koppelt. De aanrekening en de terugboeking bij annulatie zijn end-to-end getest op de echte databank, in een transactie die daarna volledig is teruggedraaid.</span>"
  )}

  <p style="margin:22px 0 0;font-size:15px;color:#22194F">Groeten,<br>Gaetan</p>
</div>`;

const send = process.argv.includes("--send");
const to = send ? TO : TEST_TO;
const res = await resend.emails.send({ from: FROM, to, replyTo: "info@fittin.be", subject: SUBJECT, html });
if (res.error) {
  console.error("mislukt:", res.error);
  process.exit(1);
}
console.log(`verstuurd naar ${to} — id ${res.data?.id}`);
