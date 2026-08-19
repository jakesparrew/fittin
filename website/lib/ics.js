// iCalendar-generator voor één boeking. Staat los van de route zodat de bevestigings- en
// herinneringsmail hetzelfde bestand als bijlage kunnen meesturen: /api/ics/[bookingId] vereist
// een cookie-sessie (en hoort dat ook te doen), en een mail heeft die niet.
//
// Waarom in de mail: een sessie die in de agenda staat, mét alarm, wordt veel minder vergeten dan
// een sessie die alleen in een mailbox staat. Eén bijlage, geen extra knop in de app.

// Formatteer een ISO-tijdstip als iCalendar-UTC-stempel: YYYYMMDDTHHMMSSZ.
function stempel(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

// Escape volgens RFC 5545 (komma's, puntkomma's, backslashes, regeleindes).
const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545 §3.1 laat maximaal 75 OCTETTEN per regel toe; langer knip je op, en elke vervolgregel
// begint met CRLF + één spatie. Onze DESCRIPTION was 159 octetten lang. Knippen gebeurt op
// octetten, niet op tekens — maar nooit midden in een UTF-8-teken, anders breekt de "·" uit de
// SUMMARY in twee halve bytes en toont de agenda een vraagteken.
function vouw(regel) {
  const bytes = Buffer.from(regel, "utf8");
  if (bytes.length <= 75) return regel;
  const stukken = [];
  let i = 0;
  let max = 75; // vervolgregels dragen een leidende spatie die meetelt → daar 74
  while (i < bytes.length) {
    let eind = Math.min(i + max, bytes.length);
    while (eind > i && eind < bytes.length && (bytes[eind] & 0xc0) === 0x80) eind--; // 10xxxxxx = vervolgbyte
    stukken.push(bytes.subarray(i, eind).toString("utf8"));
    i = eind;
    max = 74;
  }
  return stukken.join("\r\n ");
}

// SEQUENCE moet stijgen bij élke nieuwe versie van dezelfde afspraak; blijft hij gelijk, dan mág
// een agenda een tweede bestand met dezelfde UID gewoon negeren — precies wat je níét wil zodra
// een verplaatste sessie het bestaande item moet bijwerken. We leiden hem af uit het moment van
// aanmaken: de verplaatsingsmail vertrekt altijd later dan de bevestigingsmail en krijgt dus
// vanzelf een hoger getal, zonder dat we ergens een versieteller moeten bijhouden.
const SEQ_EPOCH = Date.UTC(2026, 0, 1);

export const ICS_BESTANDSNAAM = "fittin-sessie.ics";

// De UID is stabiel per boeking: een agenda herkent een tweede bestand (bijv. uit de
// herinneringsmail) dan als dezelfde afspraak en zet er geen duplicaat naast.
export function bookingIcs({ id, startsAt, endsAt, serviceName, address }, nu = new Date()) {
  if (!id || !startsAt || !endsAt) return null;
  const naam = serviceName || "Fittin' sessie";
  const adres = address || "Aannemersstraat 186, 9040 Gent";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fittin//Reservering//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:booking-${id}@fittin.be`,
    // DTSTAMP is het moment waarop dít bestand gemaakt is, niet de starttijd van de sessie.
    // Met de starttijd erin liep de stempel bij een verplaatsing naar vroeger achteruit — voor een
    // agenda hetzelfde signaal als "oudere versie", dus negeren.
    `DTSTAMP:${stempel(nu.toISOString())}`,
    `SEQUENCE:${Math.max(0, Math.floor((nu.getTime() - SEQ_EPOCH) / 1000))}`,
    `DTSTART:${stempel(startsAt)}`,
    `DTEND:${stempel(endsAt)}`,
    `SUMMARY:${esc(naam + " · Fittin'")}`,
    `DESCRIPTION:${esc("Jouw gereserveerde sessie bij Fittin'. Je toegangscode komt ± 5 minuten voor je sessie per e-mail. Verplaatsen kan tot 6 uur vooraf in je account.")}`,
    `LOCATION:${esc(adres)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc("Je Fittin'-sessie start binnen 30 minuten")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(vouw).join("\r\n");
}

// Resend-bijlage. `content` moet base64 zijn; null wanneer er geen agenda-item te maken valt,
// zodat een oproeper hem gewoon kan weglaten.
export function icsAttachment(booking, nu = new Date()) {
  const inhoud = bookingIcs(booking || {}, nu);
  if (!inhoud) return null;
  return { filename: ICS_BESTANDSNAAM, content: Buffer.from(inhoud, "utf8").toString("base64") };
}
