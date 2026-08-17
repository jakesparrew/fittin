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

export const ICS_BESTANDSNAAM = "fittin-sessie.ics";

// De UID is stabiel per boeking: een agenda herkent een tweede bestand (bijv. uit de
// herinneringsmail) dan als dezelfde afspraak en zet er geen duplicaat naast.
export function bookingIcs({ id, startsAt, endsAt, serviceName, address }) {
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
    `DTSTAMP:${stempel(startsAt)}`,
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
  ].join("\r\n");
}

// Resend-bijlage. `content` moet base64 zijn; null wanneer er geen agenda-item te maken valt,
// zodat een oproeper hem gewoon kan weglaten.
export function icsAttachment(booking) {
  const inhoud = bookingIcs(booking || {});
  if (!inhoud) return null;
  return { filename: ICS_BESTANDSNAAM, content: Buffer.from(inhoud, "utf8").toString("base64") };
}
