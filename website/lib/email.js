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
export async function sendBookingConfirmation({ to, name, serviceName, startsAt, endsAt, persons, free, address }) {
  const addr = address || "Aannemersstraat 186, 9040 Gent";
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
  const rows = [
    ["Sessie", serviceName],
    ["Wanneer", dayLabel(startsAt)],
    ["Uur", timeRange(startsAt, endsAt)],
    ["Personen", persons],
    ["Adres", addr],
  ];
  if (free) rows.push(["Prijs", `<span style="color:#33B24A">Gratis (FittinWelcome)</span>`]);
  await send(
    to,
    "Je Fittin'-boeking is bevestigd ✅",
    shell({
      title: "Je boeking is bevestigd ✅",
      intro: `Hallo ${name || "daar"}, je sessie staat vast. Hier is alvast alles wat je moet weten:`,
      rows,
      body: `
        <div style="text-align:center"><a href="${mapsUrl}" style="display:inline-block;margin:6px 0;background:#5FDA6B;color:#22194F;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:999px;font-size:14px">📍 Navigeer naar de gym</a></div>
        <div style="margin-top:16px;border-top:1px solid #ece9f5;padding-top:14px">
          <p style="font-size:14px;font-weight:bold;color:#22194F;margin:0 0 6px">Zo kom je binnen</p>
          <ol style="font-size:13px;color:#6b6685;margin:0;padding-left:18px;line-height:1.6">
            <li>Je krijgt je <b>persoonlijke toegangscode ± 5 minuten voor je sessie</b> — per mail én in de app.</li>
            <li>Toets de code in op het paneel naast de voordeur, of open de deur met de knop in je account.</li>
            <li>De toegang werkt enkel tijdens jouw tijdslot.</li>
          </ol>
          <p style="font-size:14px;font-weight:bold;color:#22194F;margin:14px 0 6px">Voor je weer vertrekt</p>
          <ul style="font-size:13px;color:#6b6685;margin:0;padding-left:18px;line-height:1.6">
            <li>Veeg de toestellen die je gebruikte schoon (spray + doek staan klaar).</li>
            <li>Leg gewichten en materiaal terug op hun vaste plaats.</li>
            <li>Doe de lichten uit en controleer of de deur dicht is.</li>
          </ul>
          <p style="font-size:13px;color:#6b6685;margin-top:14px">Verplaatsen kan tot 6u vooraf in je account. We sturen je dag op voorhand nog een herinnering.</p>
        </div>`,
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

// ---- Member: booking moved to a new time ----
export async function sendBookingRescheduled({ to, name, serviceName, startsAt, endsAt }) {
  await send(
    to,
    "Je Fittin'-sessie is verplaatst",
    shell({
      title: "Je sessie is verplaatst ✅",
      intro: `Hallo ${name || "daar"}, je sessie staat nu op een nieuw moment:`,
      rows: [
        ["Sessie", serviceName],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt, endsAt)],
      ],
      body: `<p style="font-size:14px;color:#6b6685;margin-top:12px">We mailen je de toegangscode opnieuw, ± 5 minuten voor de nieuwe starttijd.</p>`,
      cta: { href: `${SITE}/account`, label: "Mijn sessies" },
    }),
    FROM_BOOKING
  );
}

// ---- Member: access code, sent ~5 minutes before the session starts ----
export async function sendAccessCode({ to, name, serviceName, startsAt, endsAt, accessCode, personal = false, address, mapsUrl }) {
  const codeCaption = personal ? "Jouw persoonlijke code" : "Toegangscode";
  const codeNote = personal
    ? `<div style="font-size:11px;color:#6b6685;margin-top:8px">Deze code is voor jou en werkt enkel tijdens je sessie.</div>`
    : "";
  const codeHtml = accessCode
    ? `<div style="margin:6px 0 4px;text-align:center"><div style="font-size:12px;color:#6b6685;letter-spacing:.08em;text-transform:uppercase">${codeCaption}</div><div style="font-size:34px;font-weight:800;letter-spacing:.18em;color:#22194F;background:#f0effa;border-radius:14px;padding:14px 0;margin-top:6px">${accessCode}</div>${codeNote}</div>`
    : `<p style="font-size:14px;color:#6b6685">Open de deur met de knop in je account zodra je sessie begint.</p>`;
  const navHtml = mapsUrl
    ? `<div style="text-align:center"><a href="${mapsUrl}" style="display:inline-block;margin:6px 0;background:#5FDA6B;color:#22194F;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:999px;font-size:14px">📍 Navigeer naar de gym</a></div>`
    : "";
  await send(
    to,
    "Je toegangscode voor Fittin' 🔑",
    shell({
      title: "Tijd om te trainen! 🔑",
      intro: `Hallo ${name || "daar"}, je sessie start zo meteen. Hier is alles om binnen te raken:`,
      rows: [
        ["Sessie", serviceName],
        ["Uur", timeRange(startsAt, endsAt)],
        ...(address ? [["Adres", address]] : []),
      ],
      body: `${codeHtml}${navHtml}
        <div style="margin-top:16px;border-top:1px solid #ece9f5;padding-top:14px">
          <p style="font-size:14px;font-weight:bold;color:#22194F;margin:0 0 6px">Zo kom je binnen</p>
          <ol style="font-size:13px;color:#6b6685;margin:0;padding-left:18px;line-height:1.6">
            <li>Toets de code in op het paneel naast de voordeur (of open de deur via de knop in je account).</li>
            <li>De toegang werkt enkel tijdens jouw tijdslot.</li>
            <li>Sluit de deur goed achter je — zeker als je als laatste vertrekt.</li>
          </ol>
          <p style="font-size:14px;font-weight:bold;color:#22194F;margin:14px 0 6px">Voor je weer vertrekt</p>
          <ul style="font-size:13px;color:#6b6685;margin:0;padding-left:18px;line-height:1.6">
            <li>Veeg de toestellen die je gebruikte schoon (spray + doek staan klaar).</li>
            <li>Leg gewichten en materiaal terug op hun vaste plaats.</li>
            <li>Doe de lichten uit en controleer of de deur dicht is.</li>
          </ul>
        </div>`,
      cta: { href: `${SITE}/huisregels`, label: "Toegang & huisregels" },
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

// ---- Member: day-before session reminder ----
export async function sendSessionReminder({ to, name, serviceName, startsAt, endsAt, coachName }) {
  await send(
    to,
    "Herinnering: je Fittin'-sessie is binnenkort",
    shell({
      title: "Tot binnenkort in de zaal! 💪",
      intro: `Hallo ${name || "daar"}, een kleine herinnering voor je geplande sessie${coachName ? ` met ${coachName}` : ""}:`,
      rows: [
        ["Sessie", serviceName],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt, endsAt)],
      ],
      body: `<p style="font-size:14px;color:#6b6685;margin-top:12px">Je toegangscode komt automatisch ± 5 minuten voor de start binnen. Kan je toch niet? Je kan je sessie tot 6u vooraf verplaatsen in je account.</p>`,
      cta: { href: `${SITE}/account`, label: "Mijn sessies" },
    }),
    FROM_BOOKING
  );
}

// ---- Coach: session-credits granted by the superadmin ----
export async function sendCoachSessionsGranted({ to, name, qty }) {
  await send(
    to,
    "Je coach-sessies zijn goedgekeurd",
    shell({
      title: `+${qty} coach-sessie${qty > 1 ? "s" : ""} toegekend ✅`,
      intro: `Hallo ${name || "coach"}, de beheerder heeft je aanvraag goedgekeurd. Je kan nu sessies inplannen met je clienten.`,
      cta: { href: `${SITE}/coach`, label: "Naar coach-dashboard" },
    })
  );
}

// ---- Member: session balance adjusted by an admin ----
export async function sendCreditsAdjusted({ to, name, delta, reason, balance }) {
  const up = delta >= 0;
  await send(
    to,
    up ? "Je hebt sessies bijgekregen" : "Je sessiesaldo is aangepast",
    shell({
      title: up ? `+${delta} sessie${Math.abs(delta) > 1 ? "s" : ""} bijgeschreven 🎉` : `${delta} sessie${Math.abs(delta) > 1 ? "s" : ""} aangepast`,
      intro: `Hallo ${name || "daar"}, je sessiesaldo is ${up ? "verhoogd" : "verlaagd"} met ${Math.abs(delta)} sessie${Math.abs(delta) > 1 ? "s" : ""}.`,
      rows: [
        ...(reason ? [["Reden", reason]] : []),
        ...(balance != null ? [["Nieuw saldo", `${balance} sessies`]] : []),
      ],
      cta: { href: `${SITE}/boeken`, label: "Boek een sessie" },
    })
  );
}

// ---- Coach sends a payment request for a session ----
export async function sendPaymentRequest({ to, name, coachName, amount, description }) {
  const eur = "€ " + ((amount || 0) / 100).toFixed(2).replace(".", ",");
  await send(
    to,
    `Betaalverzoek van ${coachName || "je coach"}`,
    shell({
      title: "Betaalverzoek voor je sessie 💪",
      intro: `Hallo ${name || "daar"}, ${coachName || "je coach"} vraagt je om een sessie te betalen via het platform.`,
      rows: [
        ["Bedrag", eur],
        ...(description ? [["Omschrijving", description]] : []),
      ],
      body: `<p style="font-size:14px;color:#6b6685">Betaal veilig met kaart via je account.</p>`,
      cta: { href: `${SITE}/account`, label: "Betaal nu" },
    }),
    FROM_BOOKING
  );
}

// ---- Invited to a session (a member added you to their booking) ----
export async function sendSessionInvite({ to, name, fromName, serviceName, startsAt, endsAt }) {
  await send(
    to,
    `${fromName} nodigt je uit voor een sessie`,
    shell({
      title: "Je bent uitgenodigd voor een sessie 💪",
      intro: `Hallo ${name || "daar"}, ${fromName} heeft je meegenomen naar een Fittin'-sessie:`,
      rows: [
        ["Sessie", serviceName],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt, endsAt)],
      ],
      body: `<p style="font-size:14px;color:#6b6685">Het bezoek telt mee voor jouw stats. Tot dan!</p>`,
      cta: { href: `${SITE}/account`, label: "Mijn account" },
    }),
    FROM_BOOKING
  );
}

// ---- Invite a NON-member by e-mail: session invite + a make-an-account CTA ----
export async function sendEmailInvite({ to, fromName, serviceName, startsAt, endsAt, signupUrl }) {
  await send(
    to,
    `${fromName} nodigt je uit bij Fittin' — je 1e sessie is gratis 🎁`,
    shell({
      title: "Je bent uitgenodigd om te trainen 💪",
      intro: `${fromName} heeft je uitgenodigd voor een sessie bij Fittin' (Gent). Maak gratis een account om je plek te bevestigen:`,
      rows: [
        ["Sessie", serviceName],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt, endsAt)],
        ["Welkomstcadeau", `<span style="color:#33B24A">Je 1e sessie is gratis 🎁</span>`],
      ],
      body: `<div style="margin-top:8px;background:#eafbe9;border:1px solid #bdebb9;border-radius:12px;padding:12px 14px;font-size:14px;color:#22194F"><b>Promotie:</b> maak nu een gratis account en je <b>allereerste sessie is volledig gratis</b> — geen kaart nodig. Daarna train je vanaf € 15 voor een uur in de privégym.</div><p style="font-size:13px;color:#9b97ab;margin-top:10px">Een account maken duurt 30 seconden. Daarna verschijnt deze sessie meteen in je account.</p>`,
      cta: { href: signupUrl || `${SITE}/login?mode=signup`, label: "Maak gratis account + claim je gratis sessie" },
    }),
    FROM_BOOKING
  );
}

// ---- Buddy asks you to come train with them ----
export async function sendBuddyJoinAsk({ to, name, fromName, serviceName, startsAt, endsAt }) {
  await send(
    to,
    `${fromName} gaat trainen — kom je mee?`,
    shell({
      title: "Kom je mee trainen? 💪",
      intro: `Hallo ${name || "daar"}, ${fromName} heeft de gym geboekt en vraagt of je meekomt:`,
      rows: [
        ["Sessie", serviceName],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt, endsAt)],
      ],
      body: `<p style="font-size:14px;color:#6b6685">Accepteer of weiger in je account.</p>`,
      cta: { href: `${SITE}/account`, label: "Reageer op de uitnodiging" },
    }),
    FROM_BOOKING
  );
}

// ---- Confirmation to the booker that their invite(s) went out ----
export async function sendInviteSent({ to, name, buddyNames, serviceName, startsAt, endsAt }) {
  await send(
    to,
    `Je uitnodiging is verstuurd`,
    shell({
      title: "Je vrienden zijn uitgenodigd 🤝",
      intro: `Hallo ${name || "daar"}, we hebben ${buddyNames || "je vrienden"} uitgenodigd voor jouw sessie:`,
      rows: [
        ["Sessie", serviceName],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt, endsAt)],
      ],
      body: `<p style="font-size:14px;color:#6b6685">Zij zien de sessie in hun account zodra je betaald hebt.</p>`,
      cta: { href: `${SITE}/account`, label: "Mijn account" },
    }),
    FROM_BOOKING
  );
}

// ---- Membership activated ----
export async function sendMembershipActive({ to, name }) {
  await send(
    to,
    "Welkom als Fittin'-member 🎉",
    shell({
      title: "Je member-abonnement is actief 🎉",
      intro: `Hallo ${name || "daar"}, top dat je member wordt! Vanaf nu:`,
      rows: [
        ["Elke maand", "1 sessie inbegrepen (binnen de maand)"],
        ["Boekingstarief", "€ 12 i.p.v. € 15"],
        ["Extra", "member-acties + voorrang bij events"],
      ],
      body: `<p style="font-size:14px;color:#6b6685">Je kan je abonnement op elk moment beheren via je account.</p>`,
      cta: { href: `${SITE}/boeken`, label: "Boek je volgende sessie" },
    })
  );
}

// ---- Buddy request accepted ----
export async function sendBuddyAccepted({ to, name, fromName }) {
  await send(
    to,
    `${fromName} is nu je buddy`,
    shell({
      title: "Jullie zijn nu buddies 🤝",
      intro: `Hallo ${name || "daar"}, ${fromName} heeft je buddy-aanvraag aanvaard. Neem elkaar mee naar een sessie — elk bezoek telt mee voor jullie stats.`,
      cta: { href: `${SITE}/boeken`, label: "Boek samen een sessie" },
    })
  );
}

// ---- Buddy request (to an existing member) ----
export async function sendBuddyRequest({ to, name, fromName }) {
  await send(
    to,
    `${fromName} wil je trainingsbuddy zijn`,
    shell({
      title: "Nieuwe buddy-aanvraag 🤝",
      intro: `Hallo ${name || "daar"}, ${fromName} wil met jou connecten als trainingsbuddy op Fittin'. Buddies kunnen elkaar meenemen naar sessies.`,
      cta: { href: `${SITE}/community`, label: "Bekijk aanvraag" },
    })
  );
}

// ---- Buddy invite (to someone without an account yet) ----
export async function sendBuddyInvite({ to, fromName, refCode }) {
  const url = `${SITE}/login?mode=signup&ref=${encodeURIComponent(refCode || "")}`;
  await send(
    to,
    `${fromName} nodigt je uit op Fittin'`,
    shell({
      title: "Train samen op Fittin' 💪",
      intro: `${fromName} nodigt je uit om samen te trainen bij Fittin' — een privégym in Gent. Maak een gratis account en je eerste uur is gratis met de code FittinWelcome.`,
      body: refCode ? `<p style="font-size:13px;color:#9b97ab;margin-top:10px">Gebruik bij registratie de vriendcode <b>${refCode}</b>.</p>` : "",
      cta: { href: url, label: "Account aanmaken" },
    })
  );
}
