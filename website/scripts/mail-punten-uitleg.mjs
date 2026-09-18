// Uitleg van Fittin' punten, zaalcheck, rustige uren en het nieuwe beheermenu — voor Ran en Gaetan.
// Gevraagd op 19-09-2026: "een mailtje met visuals en alle uitleg, met de juiste links om te testen".
//
//   node --env-file=.env.local scripts/mail-punten-uitleg.mjs         → enkel naar Gaetan (nalezen)
//   node --env-file=.env.local scripts/mail-punten-uitleg.mjs --send  → naar Ran (info@fittin.be) én Gaetan
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Fittin' <info@fittin.be>";
const RAN = "info@fittin.be";
const GAETAN = "gaetanjansseune@gmail.com";
const SITE = "https://fittin.be";
const SUBJECT = "Nieuw in Fittin': punten, zaalcheck, rustige uren — zo werkt het (met testlinks)";

const INK = "#22194F", SOFT = "#6b6685", GROEN = "#5FDA6B", DGROEN = "#1a7d34", LIJN = "#ece9f5", PAPER = "#f7f7fb";
const P = (t) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${INK}">${t}</p>`;
const H = (nr, t) => `<h2 style="margin:34px 0 12px;font-size:19px;color:${INK}"><span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:999px;background:${GROEN};color:${INK};font-size:14px;margin-right:8px">${nr}</span>${t}</h2>`;
const LI = (items) => `<ul style="margin:0 0 12px;padding-left:20px;font-size:14px;line-height:1.6;color:${INK}">${items.map((i) => `<li style="margin:0 0 5px">${i}</li>`).join("")}</ul>`;
const KNOP = (href, t) => `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;background:${GROEN};color:${INK};text-decoration:none;font-weight:bold;font-size:13px;padding:9px 16px;border-radius:999px">${t} →</a>`;
const KNOP2 = (href, t) => `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;background:#fff;border:1px solid #d9d5ea;color:${INK};text-decoration:none;font-weight:bold;font-size:13px;padding:8px 14px;border-radius:999px">${t} →</a>`;
const KAART = (inhoud, bg = PAPER) => `<div style="margin:10px 0 14px;background:${bg};border:1px solid ${LIJN};border-radius:16px;padding:16px">${inhoud}</div>`;
const LABEL = (t) => `<p style="margin:0 0 8px;font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:#8b86a3">${t}</p>`;
const TABEL = (rijen) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">${rijen.map(([a, b], i) =>
  `<tr><td style="padding:7px 0;${i ? `border-top:1px solid ${LIJN};` : ""}color:${INK}">${a}</td><td style="padding:7px 0;${i ? `border-top:1px solid ${LIJN};` : ""}text-align:right;font-weight:bold;color:${DGROEN};white-space:nowrap">${b}</td></tr>`).join("")}</table>`;

// ---------- visuals (HTML-namaak van wat leden en jij zien) ----------
const visZaalcheck = KAART(`
  ${LABEL("Zo ziet het lid het — in de deurcodemail, onder de code")}
  <div style="background:#fff;border:1px solid ${LIJN};border-radius:14px;padding:14px;text-align:center">
    <div style="font-size:30px;font-weight:800;letter-spacing:.18em;color:${INK};background:#f0effa;border-radius:12px;padding:10px 0">4 7 1 9</div>
    <p style="margin:12px 0 8px;font-size:14px;font-weight:bold;color:${INK}">Hoe vond je de zaal toen je binnenkwam?</p>
    ${["👍 Netjes", "🧼 Niet netjes", "🔧 Iets stuk"].map((l) => `<span style="display:inline-block;margin:2px;background:#fff;border:1px solid #d9d5ea;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:bold;color:${INK}">${l}</span>`).join("")}
    <p style="margin:8px 0 0;font-size:11px;color:#8b86a3">Eén tik = 3 punten. Enkel de zaakvoerder leest mee.</p>
    <p style="margin:10px 0 0;font-size:12px;color:${SOFT}">🔥 6 weken op rij · Regular · 312 punten</p>
  </div>`);

const visNetheid = KAART(`
  ${LABEL("Zo zie jij het — Beheer → Meldingen & netheid → Netheid")}
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>
    ${[["Netjes deze week", "86%"], ["Zaalchecks", "23"], ["Niet netjes", "3"]].map(([l, v]) => `<td style="padding:4px"><div style="background:#fff;border:1px solid ${LIJN};border-radius:12px;padding:10px"><div style="font-size:10px;color:#8b86a3;text-transform:uppercase;font-weight:bold">${l}</div><div style="font-size:20px;font-weight:800;color:${INK}">${v}</div></div></td>`).join("")}
  </tr></table>
  <div style="margin-top:8px;background:#fff;border:1px solid ${LIJN};border-radius:12px;padding:12px;font-size:13px;color:${INK}">
    <b>🧼 Niet netjes</b> · di 23 sep 19:00 · gemeld door An<br>
    <span style="color:${SOFT}">Gewichten niet teruggelegd · Flessen/afval</span><br>
    <b>Vóór deze sessie:</b> <span style="color:${DGROEN};font-weight:bold">Tom</span> · 17:00–18:00 · 2 personen<br>
    <span style="display:inline-block;margin-top:8px;border:1px solid #d9d5ea;border-radius:999px;padding:4px 10px;font-size:12px">Terecht</span>
    <span style="display:inline-block;margin-top:8px;border:1px solid #d9d5ea;border-radius:999px;padding:4px 10px;font-size:12px">Onterecht</span>
    <span style="display:inline-block;margin-top:8px;background:${GROEN};border-radius:999px;padding:4px 10px;font-size:12px;font-weight:bold">Stuur vriendelijke herinnering</span>
  </div>`);

const visPuntenkaart = KAART(`
  ${LABEL("Zo ziet het lid het — op /account, onder “Boek jouw volgende sessie”")}
  <div style="background:#fff;border:1px solid ${LIJN};border-radius:14px;padding:14px">
    <table role="presentation" style="width:100%"><tr>
      <td><div style="font-size:11px;color:#8b86a3;font-weight:bold;text-transform:uppercase">Fittin' punten</div>
        <div style="font-size:24px;font-weight:800;color:${INK}">350 <span style="font-size:14px;color:${SOFT}">punten</span></div>
        <div style="font-size:13px;color:${SOFT}">Niveau <b style="color:${INK}">Regular</b> · nog 400 tot Vaste klant</div></td>
      <td style="text-align:right"><span style="background:${GROEN};border-radius:999px;padding:9px 14px;font-weight:bold;font-size:13px;color:${INK}">🎁 Wissel in</span></td>
    </tr></table>
    <div style="margin:12px 0 4px;height:10px;background:${PAPER};border-radius:999px"><div style="width:100%;height:10px;background:${GROEN};border-radius:999px"></div></div>
    <div style="font-size:12px;color:${SOFT}">Genoeg voor een gratis sessie!</div>
    <div style="margin-top:10px">${["Deze week 1/2", "💪 nog 7 sessies", "👋 Vriend uitnodigen: tot +270", "⚡ Rustig uur: dubbele punten"].map((t) => `<span style="display:inline-block;margin:2px;background:${PAPER};border-radius:999px;padding:6px 10px;font-size:12px;font-weight:bold;color:${INK}">${t}</span>`).join("")}</div>
  </div>`);

const vak = (t, k) => `<td style="padding:2px"><div style="width:44px;height:22px;line-height:22px;text-align:center;border-radius:6px;font-size:11px;font-weight:bold;${k === "r" ? `background:#fef3c7;border:1px solid #f59e0b;color:${INK}` : k === "d" ? `background:#eef7ef;color:#9b97ab` : `background:#eaf9ec;border:1px solid #bdebc3;color:${DGROEN}`}">${t}</div></td>`;
const visRustig = KAART(`
  ${LABEL("Zo ziet het lid het — het rooster op /boeken")}
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto">
    <tr><td></td>${["ma", "di", "wo", "do"].map((d) => `<td style="text-align:center;font-size:11px;color:#8b86a3;font-weight:bold">${d}</td>`).join("")}</tr>
    <tr><td style="font-size:11px;color:#8b86a3;padding-right:6px">14:00</td>${vak("⚡", "r")}${vak("⚡", "r")}${vak("", "g")}${vak("⚡", "r")}</tr>
    <tr><td style="font-size:11px;color:#8b86a3;padding-right:6px">18:00</td>${vak("vol", "d")}${vak("", "g")}${vak("vol", "d")}${vak("", "g")}</tr>
    <tr><td style="font-size:11px;color:#8b86a3;padding-right:6px">21:00</td>${vak("⚡", "r")}${vak("", "g")}${vak("⚡", "r")}${vak("⚡", "r")}</tr>
  </table>
  <p style="margin:10px 0 0;text-align:center;font-size:12px;color:${SOFT}">⚡ = rustig uur: <b>2 uur voor de prijs van 1</b> en <b>dubbele punten</b> · knop “Toon enkel rustige uren”</p>`);

const visMenu = KAART(`
  ${LABEL("Het nieuwe beheermenu — 14 in plaats van 24 items")}
  <table role="presentation" style="width:100%;font-size:13px;color:${INK}"><tr>
    <td style="vertical-align:top;padding-right:10px">
      <b>▦ Dashboard</b><br>✉ Inbox<br>🛟 Meldingen & netheid<br>🔔 Notificaties<br><br>
      <span style="color:#8b86a3;font-size:11px;font-weight:bold">GYM</span><br>Boekingen · Leden · Coaches</td>
    <td style="vertical-align:top">
      <span style="color:#8b86a3;font-size:11px;font-weight:bold">GELD</span><br>Betalingen & financiën<br>
      <span style="color:#8b86a3;font-size:11px;font-weight:bold">GROEI</span><br>🏅 Punten & community<br>Mails & campagnes<br>Cijfers & verkeer<br>
      <span style="color:#8b86a3;font-size:11px;font-weight:bold">COACHING · INSTELLINGEN</span><br>Programma's · AI-coach · Instellingen & prijzen</td>
  </tr></table>
  <p style="margin:10px 0 0;font-size:12px;color:${SOFT}">De pagina's die samen horen, staan als <b>tabs</b> bovenaan (bv. Betalingen · Financiën · Abonnementen). Alle oude links werken nog.</p>`);

const html = `<div style="font-family:Lato,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#ffffff">
  <p style="margin:0 0 4px;font-size:24px;font-weight:800;color:${INK}">Fittin<span style="color:${GROEN}">’</span></p>
  ${P("Hey Ran (en Gaetan),")}
  ${P("Sinds gisteravond staat er een groot nieuw stuk live. Het doel: <b>leden vaker laten komen</b>, <b>meer mensen laten meebrengen</b>, de <b>lege uren vullen</b> — en jij weet voortaan <b>wie de zaal niet netjes achterlaat</b>. Hieronder alles, met een visual en een link om het zelf te testen.")}
  ${KAART(`${LABEL("In één oogopslag")}${LI([
    "<b>Zaalcheck</b> — leden tikken bij het binnenkomen hoe ze de zaal vonden; jij ziet wie er vóór hen zat.",
    "<b>Punten</b> — voor trainen, gasten meebrengen, de zaalcheck …; <b>300 punten = 1 gratis sessie</b>.",
    "<b>Rustige uren</b> — lege uren worden automatisch 2 uur voor de prijs van 1, met dubbele punten.",
    "<b>Gasten</b> — wie meekomt, bevestigt zelf met “Ik kom”; vrienden die klant worden, leveren veel punten op.",
    "<b>Beheer</b> — een nieuw Punten-dashboard, een Netheid-pagina en een menu van 14 in plaats van 24 items.",
  ])}`, "#f0fdf4")}

  ${H(1, "Zaalcheck: wie liet de zaal zo achter?")}
  ${P("In de deurcodemail (die iedereen opent) staan nu drie knoppen onder de code. Het lid tikt hoe de zaal eruitzag bij het binnenkomen. Bij “niet netjes” of “iets stuk” kan het een foto en details toevoegen; “iets stuk” komt ook als melding bij jou binnen, met mail.")}
  ${visZaalcheck}
  ${P("Wie er vóór zat (dezelfde dag, max. 3 uur ervoor), wordt automatisch gekoppeld. <b>Leden zien dat nooit</b> — enkel jij. Een kleur per persoon verschijnt pas na 3 checks. Er vertrekt <b>nooit automatisch</b> iets: een vriendelijke herinnering stuur je zelf, met één klik.")}
  ${visNetheid}
  ${KNOP(`${SITE}/beheer/netheid`, "Open Netheid")}

  ${H(2, "Punten: wat verdien je waarmee?")}
  ${TABEL([
    ["Een sessie getraind (na afloop)", "+10 · ×2 op rustig uur"],
    ["Weekdoel gehaald · elke 4 weken op rij", "+5 · +20"],
    ["Zaalcheck (+2 met foto) · sessie beoordelen", "+3 · +2"],
    ["Gast bevestigt “Ik kom” · vriend maakt account", "+5 · +20"],
    ["Vriend traint voor het eerst (betaald)", "+100 (vriend zelf +25)"],
    ["Vriend neemt abonnement of kaart", "+150"],
    ["Abonnement starten · elke betaalde maand · beurtenkaart", "+50 · +20 · +30"],
    ["Training loggen · gewicht bijhouden", "+3/dag · +3/week"],
    ["AI-coach: intake · check-in · mijlpaal · plan af", "+30 · +5 · +20 · +50"],
    ["Nieuwe leden: startersopdracht (profiel → 3e sessie)", "tot +155"],
    ["Maandelijks: top 3 · meest verbeterd · beste aanbrenger", "+50/30/20 · +50 · +50"],
  ])}
  ${P("<b>300 punten = 1 gratis sessie</b> (3 maanden geldig). Remmen: max. 1 per lid per maand en <b>max. 10 per maand voor de hele gym</b> (+5 extra voor ambassadeurs die 3 of 5 vrienden binnenbrachten). Inwisselen verlaagt het niveau nooit. Punten vervallen na 12 maanden zonder sessie. Een geannuleerde of terugbetaalde sessie gaat er weer af. Enkel <b>leden</b> sparen — coaches en beheerders niet.")}
  ${visPuntenkaart}
  ${P("Leden vinden alles op hun account (boeken blijft bovenaan, de puntenkaart staat eronder) en op een eigen puntenpagina met bij elke manier om punten te verdienen een knop ernaartoe. Ook de bevestiging na het boeken en de uitnodigingsknoppen tonen hoeveel punten iets oplevert.")}
  ${KNOP(`${SITE}/account`, "Mijn account")}${KNOP2(`${SITE}/account/punten`, "Mijn punten")}${KNOP2(`${SITE}/community`, "Community & klassement")}

  ${H(3, "Rustige uren: de lege uren vullen")}
  ${P("Elke nacht om 03:00 kijkt het systeem naar de laatste <b>8 weken</b>: in hoeveel van die weken was elk uur (bv. “dinsdag 14:00”) geboekt? Uren die hoogstens 1 keer geboekt werden, zijn kandidaat. Daaruit kiest het de <b>12 rustigste uren per week</b>, altijd in <b>blokken van 2 uur</b>: het gratis tweede uur valt zo nooit in een druk uur. Het past zich vanzelf aan: vult een rustig uur zich, dan verschuift de promotie naar een ander leeg uur.")}
  ${visRustig}
  ${P("Op een rustig uur: <b>2 uur boeken = 1 uur betalen</b>, en de sessie telt dubbel voor punten. Het voordeel wordt vastgezet bij het boeken. Een rustige boeking kan enkel naar een ander rustig uur verplaatst worden.")}
  ${P(`In Beheer → Punten stel je het aantal rustige uren per week in (nu 12), en kan je uren vastpinnen: <b>altijd</b> rustig of <b>nooit</b>.`)}
  ${KNOP(`${SITE}/boeken?rustig=1`, "Rooster met rustige uren")}${KNOP2(`${SITE}/beheer/punten`, "Instellen in Beheer → Punten")}

  ${H(4, "Gasten en vrienden")}
  ${LI([
    "Boek je voor 2–4 personen, dan kan je gasten erbij zetten — ook achteraf, per e-mail, vanuit je account (“Wie komt er mee?”).",
    "De gast krijgt een uitnodiging met een <b>“✅ Ik kom”</b>-knop. Pas na die tik telt meetrainen voor punten (anders boek je voor 4 en zet je 3 namen erbij).",
    "Een gast zonder account krijgt de weg naar een account mét de code van wie uitnodigde — zo telt hij voor diens punten.",
    "Het huidige geschenk (gratis sessie bij een aangebrachte vriend) blijft bestaan; de punten komen erbovenop.",
  ])}

  ${H(5, "Beheer → Punten & community")}
  ${LI([
    "<b>Deze maand</b>: punten verdiend, gratis sessies t.o.v. het plafond, wat dat kost, en het open saldo.",
    "<b>Werkt het?</b> — de 8 weken vóór de lancering tegenover nu: sessies per lid, vaste klanten, 2e sessie binnen 14 dagen bij nieuwe leden.",
    "<b>Groei via leden</b>: van gast tot klant, met wie het meest mensen meebrengt.",
    "<b>Blijven ze komen?</b> — per aanmeldmaand: wie traint 1, 2, 3 maanden later nog.",
    "Alle leden met punten, handmatig punten bij- of afzetten (met reden), en <b>alle waarden instelbaar</b>.",
  ])}
  ${KNOP(`${SITE}/beheer/punten`, "Open Beheer → Punten")}${KNOP2(`${SITE}/beheer/challenges`, "Challenges (3 sjablonen)")}

  ${H(6, "Mails & campagnes")}
  ${P("In Activatie staan twee nieuwe sjablonen, als <b>concept</b> — er vertrekt niets tot jij ze activeert:")}
  ${LI([
    "<b>Abonnement na 2e sessie</b> — wie deze maand al 2× los betaalde, krijgt eerlijk rekenwerk. Je volgt het <b>per persoon</b>: verstuurd → geopend → abonnement gestart.",
    "<b>Rustige uren deze week</b> — voor recent actieve leden, met de rustige momenten van de week erin.",
  ])}
  ${KNOP(`${SITE}/beheer/activatie`, "Open Activatie → Sjablonen")}

  ${H(7, "Beoordelingen en Google-reviews")}
  ${P("Na een sessie krijgen leden één mail met 5 sterren (nu max. <b>1 keer per week</b> i.p.v. per maand). Eén tik op een ster = beoordeling bewaard (+2 punten). Op de bedankpagina: “hoe voelde je training?”, “ik heb alles teruggelegd” en de knop naar Google — <b>voor iedereen dezelfde</b>, ook na 1 ster (Google verbiedt enkel tevreden klanten te vragen).")}
  ${P("De Google-knop opent nu rechtstreeks het venster <b>“review schrijven”</b> van Fittin'.")}
  ${KNOP2(`${SITE}/beheer/netheid?tab=ervaring`, "Beoordelingen bekijken")}

  ${H(8, "Het nieuwe beheermenu")}
  ${visMenu}

  ${H(9, "Zelf testen — checklist")}
  ${LI([
    `Gaetan heeft <b>350 testpunten</b> gekregen: open <a href="${SITE}/account" style="color:${DGROEN}">/account</a> → puntenkaart. (Inwisselen maakt een echte gratis sessie aan.)`,
    `Rooster: <a href="${SITE}/boeken?rustig=1" style="color:${DGROEN}">/boeken?rustig=1</a> → kies 2 uur op een ⚡-uur: het totaal toont € 15.`,
    `Boek een sessie voor 2 personen en zet een gast erbij → de gast krijgt “Ik kom”.`,
    `Bij je volgende sessie: tik in de deurcodemail op een zaalcheck-knop → verschijnt in <a href="${SITE}/beheer/netheid" style="color:${DGROEN}">Netheid</a>.`,
    `Beheer: <a href="${SITE}/beheer/punten" style="color:${DGROEN}">Punten</a> · <a href="${SITE}/beheer/netheid" style="color:${DGROEN}">Netheid</a> · <a href="${SITE}/beheer/activatie" style="color:${DGROEN}">Activatie</a> · <a href="${SITE}/beheer/challenges" style="color:${DGROEN}">Challenges</a>`,
    `Spelregels voor leden: <a href="${SITE}/voorwaarden#punten" style="color:${DGROEN}">voorwaarden, artikel 11</a>.`,
  ])}

  ${KAART(`<b style="color:${INK}">Wat jij nog kan beslissen</b>${LI([
    "Rustige uren strenger of ruimer zetten (Beheer → Punten).",
    "De twee campagnes activeren wanneer je er klaar voor bent.",
    "Het plafond van 10 gratis sessies per maand hoger of lager zetten.",
  ])}`)}

  <p style="margin:22px 0 0;font-size:15px;color:${INK}">Groeten,<br>Gaetan</p>
</div>`;

const send = process.argv.includes("--send");
const to = send ? [RAN, GAETAN] : [GAETAN];
const res = await resend.emails.send({ from: FROM, to, replyTo: GAETAN, subject: SUBJECT, html });
if (res.error) { console.error("mislukt:", res.error); process.exit(1); }
console.log(`verstuurd naar ${to.join(", ")} — id ${res.data?.id}`);
