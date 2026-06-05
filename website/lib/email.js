import { Resend } from "resend";

// Transactional email via Resend. Degrades to a no-op until configured.
const key = process.env.RESEND_API_KEY;
export const isEmailConfigured = Boolean(key);
const resend = key ? new Resend(key) : null;

// Per-purpose sending identities (separate verified domains keep reputations isolated):
//  • general/account mail  → info@fittin.be          (also the personal/receiving domain)
//  • booking/session mail  → boekingen@booking.fittin.be
//  • newsletter/campaigns  → nieuwsbrief@news.fittin.be   (see lib/newsletter.js)
// All replies route to info@fittin.be.
const FROM = process.env.EMAIL_FROM || "Fittin' <info@fittin.be>";
const FROM_BOOKING = process.env.EMAIL_FROM_BOOKING || "Fittin' Boekingen <boekingen@booking.fittin.be>";
export const FROM_NEWS = process.env.EMAIL_FROM_NEWS || "Fittin' <nieuwsbrief@news.fittin.be>";
export const REPLY_TO = process.env.EMAIL_REPLY_TO || "info@fittin.be";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

const fmt = (iso, opts) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", ...opts }).format(new Date(iso));
const dayLabel = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
const timeRange = (a, b) => `${fmt(a, { hour: "2-digit", minute: "2-digit" })}${b ? "–" + fmt(b, { hour: "2-digit", minute: "2-digit" }) : ""}`;

// Shared branded shell. `body` is inner HTML; `cta` is optional { href, label }.
function shell({ title, intro, rows = [], body = "", cta }) {
  const rowsHtml = rows.length
    ? `<table style="border-collapse:collapse;margin:18px 0;width:100%">${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 14px 6px 0;color:#6b6685;font-size:14px">${k}</td><td style="font-weight:bold;font-size:14px;text-transform:${
              k === "Wanneer" ? "capitalize" : "none"
            }">${v}</td></tr>`
        )
        .join("")}</table>`
    : "";
  const ctaHtml = cta
    ? `<a href="${cta.href}" style="display:inline-block;margin:8px 0 4px;background:#22194F;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;font-size:14px">${cta.label}</a>`
    : "";
  return `
  <div style="background:#f6f5fb;padding:28px 0">
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #ece9f5">
      <div style="background:#22194F;padding:20px 28px">
        <span style="color:#fff;font-size:22px;font-weight:800">Fittin<span style="color:#C6F24E">'</span></span>
      </div>
      <div style="padding:26px 28px;color:#22194F">
        <h1 style="margin:0 0 12px;font-size:20px;color:#22194F">${title}</h1>
        ${intro ? `<p style="margin:0 0 4px;font-size:15px;line-height:1.5">${intro}</p>` : ""}
        ${rowsHtml}
        ${body}
        ${ctaHtml}
      </div>
      <div style="padding:16px 28px;border-top:1px solid #ece9f5;color:#9b97ab;font-size:12px">
        Fittin' · Aannemersstraat 186, 9040 Gent · <a href="${SITE}" style="color:#9b97ab">fittin.be</a>
      </div>
    </div>
  </div>`;
}

async function send(to, subject, html, from = FROM) {
  if (!resend || !to) return;
  try {
    await resend.emails.send({ from, to, replyTo: REPLY_TO, subject, html });
  } catch (e) {
    console.error("email send failed:", subject, e?.message);
  }
}

// ---- Member: booking confirmed ----
export async function sendBookingConfirmation({ to, name, serviceName, startsAt, endsAt, persons, free }) {
  const rows = [
    ["Sessie", serviceName],
    ["Wanneer", dayLabel(startsAt)],
    ["Uur", timeRange(startsAt, endsAt)],
    ["Personen", persons],
  ];
  if (free) rows.push(["Prijs", `<span style="color:#33B24A">Gratis (FittinWelcome)</span>`]);
  await send(
    to,
    "Je Fittin'-boeking is bevestigd",
    shell({
      title: "Je boeking is bevestigd ✅",
      intro: `Hallo ${name || "daar"}, je sessie staat vast. Tot binnenkort in de zaal!`,
      rows,
      body: `<p style="font-size:14px;color:#6b6685;margin-top:14px">De deur opent tijdens je tijdslot via de app.</p>`,
      cta: { href: `${SITE}/account`, label: "Mijn sessies" },
    }),
    FROM_BOOKING
  );
}

// ---- Member: booking cancelled ----
export async function sendBookingCancelled({ to, name, serviceName, startsAt }) {
  await send(
    to,
    "Je Fittin'-boeking is geannuleerd",
    shell({
      title: "Je boeking is geannuleerd",
      intro: `Hallo ${name || "daar"}, deze sessie is geannuleerd:`,
      rows: [
        ["Sessie", serviceName],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt)],
      ],
      body: `<p style="font-size:14px;color:#6b6685">Was dit niet de bedoeling? Boek gerust een nieuw moment.</p>`,
      cta: { href: `${SITE}/boeken`, label: "Nieuwe sessie boeken" },
    }),
    FROM_BOOKING
  );
}

// ---- Member: a coach booked a session for you ----
export async function sendCoachBooked({ to, name, coachName, serviceName, startsAt, endsAt }) {
  await send(
    to,
    `${coachName} heeft een sessie voor je geboekt`,
    shell({
      title: "Je coach heeft een sessie geboekt 💪",
      intro: `Hallo ${name || "daar"}, ${coachName} heeft een sessie voor je ingepland:`,
      rows: [
        ["Coach", coachName],
        ["Sessie", serviceName],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt, endsAt)],
      ],
      cta: { href: `${SITE}/account`, label: "Bekijk in mijn account" },
    }),
    FROM_BOOKING
  );
}

// ---- Member: a coach got assigned to you ----
export async function sendCoachAssigned({ to, name, coachName }) {
  await send(
    to,
    `${coachName} is nu je coach`,
    shell({
      title: "Je hebt een coach 🙌",
      intro: `Hallo ${name || "daar"}, ${coachName} is toegewezen als jouw coach. Samen werken jullie aan je doelen — je coach kan sessies voor je inplannen en je programma opvolgen.`,
      cta: { href: `${SITE}/training`, label: "Mijn training" },
    })
  );
}

// ---- Member: role changed (made coach / admin / member) ----
export async function sendRoleChanged({ to, name, role }) {
  const label = role === "coach" ? "coach" : role === "beheerder" ? "beheerder" : "lid";
  const extra =
    role === "coach"
      ? `Je hebt nu toegang tot het coach-dashboard om sessies met clients in te plannen.`
      : role === "beheerder"
      ? `Je hebt nu volledige toegang tot het beheer van Fittin'.`
      : `Je account is teruggezet naar een gewoon lidmaatschap.`;
  const cta =
    role === "coach" ? { href: `${SITE}/coach`, label: "Naar coach-dashboard" } : role === "beheerder" ? { href: `${SITE}/beheer`, label: "Naar beheer" } : { href: `${SITE}/account`, label: "Mijn account" };
  await send(
    to,
    `Je rol bij Fittin' is nu ${label}`,
    shell({ title: `Je bent nu ${label}`, intro: `Hallo ${name || "daar"}, ${extra}`, cta })
  );
}

// ---- Member: account created by admin (set-password link) ----
export async function sendWelcomeNewAccount({ to, name, link }) {
  await send(
    to,
    "Welkom bij Fittin' — stel je wachtwoord in",
    shell({
      title: "Welkom bij Fittin' 👋",
      intro: `Hallo ${name || "daar"}, er is een account voor je aangemaakt bij Fittin'. Stel hieronder je wachtwoord in en je kan meteen sessies boeken.`,
      body: `<p style="font-size:13px;color:#9b97ab;margin-top:14px">Werkt de knop niet? Plak deze link in je browser:<br>${link}</p>`,
      cta: { href: link, label: "Wachtwoord instellen" },
    })
  );
}

// ---- Member: event signup confirmed ----
export async function sendEventSignup({ to, name, title, startsAt }) {
  await send(
    to,
    `Inschrijving bevestigd: ${title}`,
    shell({
      title: "Je bent ingeschreven 🎉",
      intro: `Hallo ${name || "daar"}, je inschrijving is bevestigd:`,
      rows: [
        ["Event", title],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt)],
      ],
      cta: { href: `${SITE}/community`, label: "Naar community" },
    })
  );
}
