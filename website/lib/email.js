import { Resend } from "resend";

// Transactional email via Resend. Degrades to a no-op until configured.
const key = process.env.RESEND_API_KEY;
export const isEmailConfigured = Boolean(key);
const resend = key ? new Resend(key) : null;

// NOTE: the sender domain must be verified in Resend. Override via EMAIL_FROM.
const FROM = process.env.EMAIL_FROM || "Fittin' <fit@fittin.be>";

const fmt = (iso, opts) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", ...opts }).format(new Date(iso));

export async function sendBookingConfirmation({ to, name, serviceName, startsAt, endsAt, persons, free }) {
  if (!resend || !to) return;
  const day = fmt(startsAt, { weekday: "long", day: "numeric", month: "long" });
  const time = `${fmt(startsAt, { hour: "2-digit", minute: "2-digit" })}–${fmt(endsAt, { hour: "2-digit", minute: "2-digit" })}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#22194F">
      <h1 style="color:#22194F">Je boeking is bevestigd ✅</h1>
      <p>Hallo ${name || "daar"}, je sessie staat vast:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#6b6685">Sessie</td><td style="font-weight:bold">${serviceName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b6685">Wanneer</td><td style="font-weight:bold;text-transform:capitalize">${day}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b6685">Uur</td><td style="font-weight:bold">${time}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b6685">Personen</td><td style="font-weight:bold">${persons}</td></tr>
        ${free ? `<tr><td style="padding:4px 12px 4px 0;color:#6b6685">Prijs</td><td style="font-weight:bold;color:#33B24A">Gratis (FittinWelcome)</td></tr>` : ""}
      </table>
      <p>Tot binnenkort in de zaal! De deur opent tijdens je tijdslot via de app.</p>
      <p style="color:#9b97ab;font-size:13px">Fittin' · Aannemersstraat 186, 9040 Gent</p>
    </div>`;
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Je Fittin'-boeking is bevestigd",
      html,
    });
  } catch (e) {
    console.error("email send failed:", e?.message);
  }
}
