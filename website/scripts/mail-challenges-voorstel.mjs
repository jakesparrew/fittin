// Voorstel voor de challenges (gamification) naar de eigenaar.
//
//   node --env-file=.env.local scripts/mail-challenges-voorstel.mjs         → test naar Gaetan
//   node --env-file=.env.local scripts/mail-challenges-voorstel.mjs --send  → naar info@fittin.be
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Fittin' <info@fittin.be>";
const TO = "info@fittin.be";
const TEST_TO = "gaetanjansseune@gmail.com";
const SUBJECT = "Voorstel: challenges die wél uitbetalen (en niet te veel weggeven)";

const TEXT = `VOORSTEL — CHALLENGES

Waarom dit nodig is
-------------------
De mediaan van onze leden is 2 sessies. 52 leden trainden ooit, 19 haalden er 3,
14 haalden er 5, en 7 haalden er 10. De helft komt dus twee keer en verdwijnt.

De mijlpalen in de app vieren sessie 1 en dan pas sessie 10. Precies tussen die
twee, waar 33 mensen afhaken, gebeurt er niets.

Er stond al een volledig challenge-systeem klaar: een tabel, een beheerscherm en
een functie die elke nacht draait. Er stonden nul challenges in.


Drie challenges om mee te starten
---------------------------------
1. DE DERDE KEER — 3 sessies in een maand, beloning 1 gratis sessie.
   Dit is de belangrijkste. De mediaan is 2; deze duwt naar 3.

2. WINTERRITME — 8 sessies in november, beloning 2 gratis sessies.
   Voor de 14 leden die al regelmatig komen.

3. DALUREN — 4 sessies tussen 6 en 16 uur, beloning 1 gratis sessie.
   Vult de uren die toch leegstaan.


Wat het kost
------------
Een gratis sessie is nominaal 15 euro, maar de zaal staat voor 75% leeg
(125 boekingen op 510 boekbare uren). In een daluur kost een extra sessie in
werkelijkheid 3 a 4 euro aan verwarming, licht en poets.

De rekensom: iemand van 2 naar 3 sessies duwen levert een echte sessie van
15 euro op, en je geeft een vierde weg die 3,50 euro kost.

Daarom ook maar EEN sessie als beloning. Twee weggeven voor een doel dat mensen
toch zouden halen, is korting op je beste leden.


De rem
------
Elke challenge krijgt een plafond: hoogstens X winnaars. Het beheerscherm rekent
live voor wat het maximaal kost. Bij 15 winnaars x 1 sessie is dat ongeveer
52 euro aan echte kosten. Wie eerst is, is eerst.


Drie fouten die eerst gerepareerd moesten worden
------------------------------------------------
1. Van de drie doeltypes in het scherm betaalde alleen "aantal sessies" uit.
   Koos je "daluren" of "streak", dan haalde een lid de challenge en kreeg hij
   stilzwijgend niets.

2. Het scherm zei dat de datums optioneel zijn. De uitbetaling eiste ze allebei.
   Een challenge zonder einddatum keerde dus nooit uit.

3. De duurste: er werd geteld op GEBOEKTE sessies, ook die in de toekomst. Wie op
   1 september drie keer vooruitboekte, had de beloning diezelfde nacht binnen
   zonder een keer te komen. Nu telt alleen wat effectief gebeurd is.

Alle drie zijn gerepareerd. Wie een challenge haalt krijgt voortaan ook een
melding; tot nu verscheen het tegoed gewoon in zijn saldo zonder dat iemand het
merkte.


Wat er nog moet gebeuren
------------------------
Migratie 0148 moet toegepast worden. Daarna maak je in het beheerscherm onder
Challenges de eerste aan. Binnen een maand weet je of het werkt.

Vragen? Antwoord gerust op deze mail.`;

const p = (t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#22194F">${t}</p>`;
const kop = (t) => `<p style="margin:26px 0 10px;font-size:13px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#5a5479">${t}</p>`;
const kaart = (titel, doel, beloning, waarom, accent) => `
<td style="padding:0 6px" valign="top" width="33%">
  <table role="presentation" width="100%" style="border-collapse:collapse;border:${accent ? "2px solid #5FDA6B" : "1px solid #E6E4F0"};border-radius:12px">
    <tr><td style="padding:16px">
      <p style="margin:0;font-size:15px;font-weight:bold;color:#22194F">${titel}</p>
      <p style="margin:4px 0 12px;font-size:13px;color:#5a5479;line-height:1.5">${doel}</p>
      <p style="margin:0;font-size:12px;color:#5a5479">Beloning</p>
      <p style="margin:2px 0 10px;font-size:18px;font-weight:bold;color:#22194F">${beloning}</p>
      <p style="margin:0;font-size:12px;color:#5a5479;line-height:1.5">${waarom}</p>
    </td></tr>
  </table>
</td>`;

const HTML = `<div style="background:#f5f6fa;padding:26px 0">
 <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #ece9f5">
  <div style="background:#22194F;padding:22px 30px">
   <span style="color:#fff;font-size:22px;font-weight:800">Fittin<span style="color:#C6F24E">'</span></span>
   <span style="color:#b2adc2;font-size:13px;letter-spacing:2px;margin-left:10px">VOORSTEL</span>
  </div>
  <div style="padding:28px 30px;color:#22194F">
   <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">Challenges die wél uitbetalen</h1>

   ${kop("Waarom")}
   ${p("De mediaan van onze leden is <strong>2 sessies</strong>. 52 leden trainden ooit, 19 haalden er 3, 14 haalden er 5 en <strong>7 haalden er 10</strong>. De helft komt dus twee keer en verdwijnt.")}
   ${p("De mijlpalen in de app vieren sessie 1, en dan pas sessie 10. Precies daartussen — waar 33 mensen afhaken — gebeurt er niets.")}
   ${p("Er stond al een volledig challenge-systeem klaar: een tabel, een beheerscherm en een functie die elke nacht draait. Er stonden <strong>nul</strong> challenges in.")}

   ${kop("Drie om mee te starten")}
   <table role="presentation" width="100%" style="border-collapse:separate;margin:0 0 16px"><tr>
     ${kaart("De derde keer", "3 sessies in één maand", "1 gratis sessie", "De mediaan is 2. Deze duwt naar 3.", true)}
     ${kaart("Winterritme", "8 sessies in november", "2 gratis sessies", "Voor je 14 vaste leden.", false)}
     ${kaart("Daluren", "4 sessies tussen 6 en 16u", "1 gratis sessie", "Vult uren die toch leegstaan.", false)}
   </tr></table>

   ${kop("Wat het kost")}
   ${p("Een gratis sessie is nominaal € 15, maar de zaal staat voor <strong>75% leeg</strong> (125 boekingen op 510 boekbare uren). In een daluur kost een extra sessie in werkelijkheid <strong>€ 3 à € 4</strong> aan verwarming, licht en poets.")}
   ${p("De rekensom: iemand van 2 naar 3 sessies duwen levert een échte sessie van € 15 op, en je geeft een vierde weg die € 3,50 kost.")}
   ${p("Daarom ook maar <strong>één</strong> sessie als beloning. Twee weggeven voor een doel dat mensen tóch zouden halen, is korting op je beste leden.")}

   ${kop("De rem")}
   ${p("Elke challenge krijgt een plafond: hoogstens X winnaars. Het beheerscherm rekent live voor wat het maximaal kost. Bij 15 winnaars × 1 sessie is dat ongeveer <strong>€ 52</strong> aan echte kosten. Wie eerst is, is eerst.")}

   ${kop("Drie fouten die eerst gerepareerd moesten worden")}
   <ol style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.65;color:#22194F">
     <li style="margin-bottom:8px">Van de drie doeltypes betaalde alleen <em>aantal sessies</em> uit. Koos je <em>daluren</em> of <em>streak</em>, dan haalde een lid de challenge en kreeg hij <strong>stilzwijgend niets</strong>.</li>
     <li style="margin-bottom:8px">Het scherm zei dat de datums optioneel zijn; de uitbetaling eiste ze allebei. Een challenge zonder einddatum keerde nooit uit.</li>
     <li>De duurste: er werd geteld op <strong>geboekte</strong> sessies, ook toekomstige. Wie op 1 september drie keer vooruitboekte, had de beloning diezelfde nacht binnen zonder één keer te komen.</li>
   </ol>
   ${p("Alle drie gerepareerd. Wie een challenge haalt krijgt voortaan ook een melding — tot nu verscheen het tegoed gewoon in zijn saldo zonder dat iemand het merkte.")}

   ${kop("Wat er nog moet gebeuren")}
   ${p("Migratie <strong>0148</strong> moet toegepast worden. Daarna maak je in het beheerscherm onder <em>Challenges</em> de eerste aan. Binnen een maand weet je of het werkt.")}
  </div>
  <div style="padding:16px 30px;border-top:1px solid #ece9f5;color:#9b97ab;font-size:12px">
   Fittin' · Aannemersstraat 186, 9040 Gent · <a href="https://fittin.be" style="color:#9b97ab">fittin.be</a>
  </div>
 </div>
</div>`;

const live = process.argv.includes("--send");
const to = live ? TO : TEST_TO;
const res = await resend.emails.send({
  from: FROM, to, replyTo: "info@fittin.be",
  subject: live ? SUBJECT : `[TEST] ${SUBJECT}`,
  text: TEXT, html: HTML,
});
if (res?.error) { console.error("VERZENDEN MISLUKT:", res.error?.message || JSON.stringify(res.error)); process.exit(1); }
console.log(`${live ? "VERZONDEN naar " + TO : "TESTMAIL"} naar ${to} — id ${res?.data?.id}`);
