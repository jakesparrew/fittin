// Zet de nieuwsbrief over workouts & oefeningen klaar als CONCEPT in /beheer/nieuwsbrief.
//
// Bewust een concept en geen verzending: er staan 716 actieve inschrijvingen op de lijst, en
// wie hem verstuurt hoort de uitbater te zijn, niet een script.
//
// Herhaalbaar: draait het script twee keer, dan werkt het dezelfde campagne bij in plaats van een
// tweede concept aan te maken.
//
//   node --env-file=.env.local scripts/nieuwsbrief-workouts.mjs            (concept bijwerken)
//   node --env-file=.env.local scripts/nieuwsbrief-workouts.mjs --test     (+ testmail naar de eigenaar)
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";

const SITE = "https://fittin.be";
const BEELD = `${SITE}/nieuwsbrief`;
const NAAM = "Workouts & oefeningen — wat er nieuw is";

// ---- bouwstenen ----------------------------------------------------------
// Alles met tabellen en inline stijlen: Gmail gooit <style>-blokken, flexbox en SVG weg.
const P = (t, extra = "") =>
  `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#2b2550;${extra}">${t}</p>`;

// 360px breed: het zijn telefoonschermen, dus op ware grootte tonen leest natuurlijker én houdt de
// mail kort. Op 520px werden ze onnodig log zonder dat je er méér op zag.
const beeld = (bestand, alt) => `
  <table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 16px">
    <tr><td align="center" style="background:#f5f6fa;border-radius:16px;padding:12px">
      <img src="${BEELD}/${bestand}" width="360" alt="${alt}"
           style="display:block;width:100%;max-width:360px;height:auto;border:0;border-radius:10px" />
    </td></tr>
  </table>`;

// Het kopje draagt het nummer, zodat wie enkel de koppen scant tóch de volgorde meekrijgt.
const kop = (n, t) => `
  <table role="presentation" width="100%" style="border-collapse:collapse;margin:26px 0 10px">
    <tr>
      <td width="30" valign="top" style="font-size:15px;font-weight:bold;color:#33B24A;padding-top:2px">${n}</td>
      <td style="font-size:19px;font-weight:bold;line-height:1.3;color:#22194F">${t}</td>
    </tr>
  </table>`;

const knop = (href, label) => `
  <table role="presentation" style="border-collapse:collapse;margin:6px 0 4px">
    <tr><td style="background:#5FDA6B;border-radius:999px">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:bold;color:#22194F;text-decoration:none">${label}</a>
    </td></tr>
  </table>`;

const streep = `<div style="height:1px;background:#ece9f5;margin:26px 0"></div>`;

// ---- de mail -------------------------------------------------------------
const body = `
${P(`Alles rond je training zit nu in de app: <strong>wat je doet, hoe je het doet, en of je
vooruitgaat</strong>. Vijf dingen, allemaal inbegrepen.`)}

${kop("1", "885 oefeningen, met foto en uitleg")}
${P(`Zoek op naam of filter op spiergroep. Bewaar je favorieten met ♡, of zet een oefening met ＋
meteen in je eigen schema.`)}
${beeld("bibliotheek.png", "De oefeningenbibliotheek met zoekveld en filters per spiergroep")}
${beeld("acties.png", "De knoppen Bewaar, In mijn schema en Doe nu en log")}
${knop(`${SITE}/oefeningen`, "Bekijk de oefeningen →")}

${streep}
${kop("2", "Je sets loggen — reps en gewicht, klaar")}
${P(`Ook losse oefeningen die je toevallig deed tellen mee. Vroeger telde alleen wat in een schema
stond.`)}
${beeld("loggen.gif", "Sets invullen: reps en kilo's per set, daarna Log sets")}

${streep}
${kop("3", "Het onthoudt wat je vorige keer deed")}
${P(`Je sets staan al ingevuld met de cijfers van vorige keer, en de app stelt zelf een volgende
stap voor. Geen briefje meer nodig.`)}
${beeld("schema.png", "Een oefening met vorige cijfers al ingevuld en een suggestie om zwaarder te gaan")}

${streep}
${kop("4", "Zien dat je vooruitgaat")}
${P(`Sessies, records, je reeks, volume per week en gewicht per oefening — allemaal uit wat je zelf
logde.`)}
${beeld("voortgang.png", "Het voortgangspaneel met sessies, records, reeks en volume per week")}
${knop(`${SITE}/training`, "Naar mijn training →")}

${streep}
${kop("5", "Je schema delen met wie met je traint")}
${P(`Eén knop maakt een WhatsApp-link. Wie hem opent heeft geen account nodig en ziet
<strong>enkel je oefeningen — niet je gewichten</strong>. Overnemen kan in één klik; trek je de
link in, dan werkt de oude meteen niet meer.`)}
${beeld("delen.png", "De deelkaart met de link, een kopieerknop en een WhatsApp-knop")}

${streep}
${P(`Verder staan er <strong>zeven kant-en-klare workouts</strong> klaar — borst, rug, schouders,
benen, armen, core en full body — die je met één knop als je eigen schema bewaart:
<a href="${SITE}/workouts" style="color:#33B24A;font-weight:bold">fittin.be/workouts</a>.`)}
${P(`Vragen of loopt er iets mis? Op
<a href="${SITE}/hulp" style="color:#33B24A;font-weight:bold">fittin.be/hulp</a> staan onze
contactgegevens en een formulier. We lezen alles zelf.`)}

<!-- Afsluiter: van lezen naar doen. De hele mail gaat over trainen — de logische laatste klik is
     een sessie boeken, niet nóg een pagina bekijken. -->
<table role="presentation" width="100%" style="border-collapse:collapse;margin:22px 0 8px">
  <tr><td align="center" style="background:#22194F;border-radius:18px;padding:26px 24px">
    <p style="margin:0 0 4px;font-size:19px;font-weight:bold;color:#ffffff">Zin gekregen?</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#B2ADC2">De zaal is een uur lang helemaal van jou.</p>
    <table role="presentation" style="border-collapse:collapse;margin:auto">
      <tr><td style="background:#5FDA6B;border-radius:999px">
        <a href="${SITE}/boeken" style="display:inline-block;padding:14px 30px;font-size:16px;font-weight:bold;color:#22194F;text-decoration:none">Boek je volgende training →</a>
      </td></tr>
    </table>
  </td></tr>
</table>

${P(`Tot in de zaal — <strong>het Fittin'-team</strong>`, "margin-top:14px;margin-bottom:4px")}
`;

// ---- wegschrijven --------------------------------------------------------
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const eis = (n, r) => { if (r.error) throw new Error(n + ": " + r.error.message); return r.data; };

const [gym] = eis("gym", await s.from("gyms").select("id").order("created_at").limit(1));
const velden = {
  gym_id: gym.id,
  kind: "newsletter",
  name: NAAM,
  subject: "Je training zit nu volledig in Fittin'",
  preheader: "885 oefeningen, je sets loggen, je voortgang zien en je schema delen — alles nieuw in de app.",
  body_html: body,
  status: "draft",
};

const bestaand = eis("zoek", await s.from("campaigns").select("id, status").eq("gym_id", gym.id).eq("kind", "newsletter").eq("name", NAAM));
let id;
if (bestaand.length) {
  const c = bestaand[0];
  // Een campagne die al vertrokken is nooit stil overschrijven.
  if (c.status !== "draft") throw new Error(`Campagne bestaat al met status "${c.status}" — niet aangeraakt.`);
  eis("update", await s.from("campaigns").update(velden).eq("id", c.id));
  id = c.id;
  console.log("concept bijgewerkt:", id);
} else {
  id = eis("insert", await s.from("campaigns").insert(velden).select("id"))[0].id;
  console.log("concept aangemaakt:", id);
}
console.log(`nazien op: ${SITE}/beheer/nieuwsbrief/${id}`);

// Lokale voorbeeldweergave, zodat je de mail kan bekijken zonder er één te versturen. De schil is
// dezelfde als in lib/newsletter.js; die kan hier niet geïmporteerd worden omdat ze via het
// "@/"-alias van Next binnenkomt en dat bestaat buiten Next niet.
// De beelden wijzen lokaal naar de dev-server, want op fittin.be staan ze pas na een deploy.
const voorbeeld = `<!doctype html><html><body style="margin:0;background:#f5f6fa">
<div style="background:#f5f6fa;padding:28px 0">
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #ece9f5">
    <div style="background:#22194F;padding:22px 32px">
      <span style="color:#fff;font-size:24px;font-weight:800">Fittin<span style="color:#C6F24E">'</span></span>
    </div>
    <div style="padding:30px 32px;color:#22194F">
      <h1 style="margin:0 0 18px;font-size:24px;line-height:1.2">${velden.subject}</h1>
      ${body}
    </div>
    <div style="padding:18px 32px;border-top:1px solid #ece9f5;color:#9b97ab;font-size:12px">
      Fittin' · Aannemersstraat 186, 9040 Gent · fittin.be<br>Geen nieuwsbrieven meer? Uitschrijven
    </div>
  </div>
</div></body></html>`.replaceAll(BEELD, "http://localhost:3210/nieuwsbrief");
await writeFile("scratch-shots/nieuwsbrief.html", voorbeeld);
console.log("voorbeeld: scratch-shots/nieuwsbrief.html");
