import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { statGrid, barChart, sectionTitle, actionItem, calloutBox, delta, eur } from "@/lib/email-visuals";
import { icsAttachment } from "@/lib/ics";

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

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

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

// Fire-and-forget log into email_log (Batch 6.2) so the cockpit can show what went out + status.
// Never throws into the caller — a logging hiccup must not affect the actual send result.
async function logEmail({ to, subject, kind, status, resendId, error }) {
  try {
    await createAdminClient().from("email_log").insert({
      to_email: Array.isArray(to) ? to.join(", ") : to,
      subject: subject || null,
      kind: kind || null,
      status,
      resend_id: resendId || null,
      error: error ? String(error).slice(0, 500) : null,
    });
  } catch (e) { console.error("email_log insert failed:", e?.message); }
}

async function send(to, subject, html, from = FROM, replyTo = REPLY_TO, kind = null, attachments = null) {
  if (!resend || !to) return { ok: false, skipped: true };
  let result, status, logErr = null, resendId = null;
  try {
    // Resend's SDK returns { data, error } and does NOT throw on API errors (unverified domain,
    // rate limit, suppression). Check res.error explicitly so a rejected send is never treated as
    // success — otherwise confirmations / reminders / door codes fail with zero trace.
    const res = await resend.emails.send({
      from, to, replyTo, subject, html,
      ...(attachments?.length ? { attachments } : {}),
    });
    if (res?.error) {
      console.error("email send error:", subject, res.error?.message || JSON.stringify(res.error));
      result = { ok: false, error: res.error };
      status = "failed"; logErr = res.error?.message || JSON.stringify(res.error);
    } else {
      resendId = res?.data?.id;
      result = { ok: true, id: resendId };
      status = "sent";
    }
  } catch (e) {
    console.error("email send failed:", subject, e?.message);
    result = { ok: false, error: e };
    status = "failed"; logErr = e?.message;
  }
  await logEmail({ to, subject, kind, status, resendId, error: logErr });
  return result;
}

// ---- Member: booking confirmed ----
export async function sendBookingConfirmation({ to, name, serviceName, startsAt, endsAt, persons, free, address, paymentSource, creditBalance, nudgeCount, amountDueCents, bookingId }) {
  const addr = address || "Aannemersstraat 186, 9040 Gent";
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
  const rows = [
    ["Sessie", esc(serviceName)],
    ["Wanneer", dayLabel(startsAt)],
    ["Uur", timeRange(startsAt, endsAt)],
    ["Personen", persons],
    ["Adres", addr],
  ];
  // Saldo als getal, niet als héél getal: sinds de halfuursessies (0117) kan een saldo 1,5 zijn en
  // dan viel de hele saldoregel weg op Number.isInteger — precies bij het lid dat zijn beurten telt.
  const bal = creditBalance === null || creditBalance === undefined || creditBalance === "" ? null : Number(creditBalance);
  const hasBalance = bal !== null && Number.isFinite(bal);
  // Source-aware price row: a punch-card or abo session must not read "Gratis (FittinWelcome)".
  if (paymentSource === "credit") {
    rows.push(["Prijs", `<span style="color:#33B24A">Betaald met je beurtenkaart${hasBalance ? ` (saldo: ${String(bal).replace(".", ",")})` : ""}</span>`]);
  } else if (paymentSource === "gratis_code") {
    rows.push(["Prijs", `<span style="color:#33B24A">Gratis (FittinWelcome)</span>`]);
  } else if (amountDueCents > 0) {
    // Onbetaalde boeking: de mail mag dan nooit "Gratis" zeggen.
    rows.push(["Prijs", `<b>€ ${(amountDueCents / 100).toFixed(2).replace(".", ",")}</b> — nog te betalen`]);
  } else if (free) {
    rows.push(["Prijs", `<span style="color:#33B24A">Gratis</span>`]);
  }
  // Nudge on the 2nd/3rd paid single ("los") session this month — pure honest arithmetic, no dark
  // pattern: show what a card/abo would have cost. nudgeCount = number of paid single sessions incl.
  // this one, in the last 30 days.
  const nudgeHtml = nudgeCount >= 2
    ? `<div style="margin:14px 0 0;background:#f0effa;border-radius:14px;padding:14px 16px">
         <p style="margin:0;font-size:14px;font-weight:bold;color:#22194F">Dit was je ${nudgeCount}e losse sessie deze maand (€${(nudgeCount * 15).toString().replace(".", ",")}).</p>
         <p style="margin:6px 0 0;font-size:13px;color:#6b6685;line-height:1.5">Met de <b>10-beurtenkaart</b> betaalde je hiervoor ±€${((nudgeCount * 1364) / 100).toFixed(2).replace(".", ",")}, met het <b>abonnement</b> €${(nudgeCount * 12).toString().replace(".", ",")}. Geen verplichting — puur ter info.</p>
         <a href="${SITE}/lidmaatschap" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:bold;color:#1a7d34;text-decoration:none">Bekijk de opties →</a>
       </div>`
    : "";
  // Laatste beurt van de kaart: de saldoregel zegt dan "saldo: 0" en verder niets, terwijl dit
  // exact het moment is waarop het lid moet weten hoe hij verder kan boeken. Eén blok, alleen bij 0.
  const emptyHtml = paymentSource === "credit" && hasBalance && bal <= 0
    ? `<div style="margin:14px 0 0;background:#f0effa;border-radius:14px;padding:14px 16px">
         <p style="margin:0;font-size:14px;font-weight:bold;color:#22194F">Dit was de laatste sessie op je saldo.</p>
         <p style="margin:6px 0 0;font-size:13px;color:#6b6685;line-height:1.5">Je volgende sessie boek je gewoon los aan € 15, of je vult je saldo weer aan met een 10-beurtenkaart (€ 150 · 11 sessies) of het abonnement (€ 12/mnd).</p>
         <a href="${SITE}/lidmaatschap" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:bold;color:#1a7d34;text-decoration:none">Bekijk de opties →</a>
       </div>`
    : "";
  await send(
    to,
    "Je Fittin'-boeking is bevestigd ✅",
    shell({
      title: "Je boeking is bevestigd ✅",
      intro: `Hallo ${esc(name) || "daar"}, je sessie staat vast. Hier is alvast alles wat je moet weten:`,
      rows,
      body: `${nudgeHtml}${emptyHtml}
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
          <p style="font-size:13px;color:#6b6685;margin-top:14px">Verplaatsen kan tot 6u vooraf in je account. We sturen je dag op voorhand nog een herinnering. Het agenda-item (met alarm 30 min vooraf) zit als bijlage bij deze mail.</p>
        </div>`,
      cta: { href: `${SITE}/account`, label: "Mijn sessies" },
    }),
    FROM_BOOKING,
    REPLY_TO,
    null,
    // Agenda-item als bijlage: een sessie die in de agenda staat wordt veel minder vergeten dan
    // een sessie die alleen in een mailbox staat. Ontbreekt de boeking-id (oudere oproeper), dan
    // gaat de mail gewoon zonder bijlage buiten.
    [icsAttachment({ id: bookingId, startsAt, endsAt, serviceName, address: addr })].filter(Boolean)
  );
}

// ---- Nieuwsbrief: bevestig je inschrijving (dubbele opt-in) ----
// Bestaat omdat iedereen elk willekeurig adres kon inschrijven: één formulierveld en de mails van
// Fittin' vielen bij een vreemde in de bus. Pas wie op deze link klikt, wordt 'active'.
export async function sendNewsletterConfirm({ to, name, confirmUrl }) {
  return send(
    to,
    "Bevestig je inschrijving op de Fittin'-nieuwsbrief",
    shell({
      title: "Nog één klik 👇",
      intro: `Hallo ${esc(name) || "daar"}, iemand schreef dit adres in op de nieuwsbrief van Fittin&rsquo;.`,
      body: `<p style="font-size:14px;color:#6b6685;line-height:1.6">Was jij dat? Bevestig het even, dan zetten we je op de lijst. Wij sturen hoogstens een paar mails per maand: nieuws uit de zaal, trainingstips en acties.</p>
             <p style="font-size:13px;color:#9b97ab;line-height:1.6;margin-top:14px">Was jij dat niet? Doe dan gewoon niets — zonder deze bevestiging sturen we je nooit iets.</p>`,
      cta: { href: confirmUrl, label: "Ja, schrijf me in" },
    }),
    FROM_NEWS,
    REPLY_TO,
    "nieuwsbrief_bevestiging"
  );
}

// ---- Member: booking cancelled ----
export async function sendBookingCancelled({ to, name, serviceName, startsAt }) {
  await send(
    to,
    "Je Fittin'-boeking is geannuleerd",
    shell({
      title: "Je boeking is geannuleerd",
      intro: `Hallo ${esc(name) || "daar"}, deze sessie is geannuleerd:`,
      rows: [
        ["Sessie", esc(serviceName)],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt)],
      ],
      body: `<p style="font-size:14px;color:#6b6685">Was dit niet de bedoeling? Boek gerust een nieuw moment.</p>`,
      cta: { href: `${SITE}/boeken`, label: "Nieuwe sessie boeken" },
    }),
    FROM_BOOKING
  );
}

const eurTxt = (c) => `€ ${((c || 0) / 100).toFixed(2).replace(".", ",")}`;

// ---- Member: monthly membership payment failed ----
export async function sendMembershipPaymentFailed({ to, name }) {
  return send(
    to,
    "Je maandbetaling is niet gelukt",
    shell({
      title: "Je maandbetaling is niet gelukt",
      intro: `Hallo ${esc(name) || "daar"}, de maandelijkse betaling van je Fittin'-abonnement (€ 12) is niet doorgegaan.`,
      body: `<p style="font-size:14px;color:#6b6685">Meestal is een verlopen of vervangen kaart de oorzaak. Werk je betaalmethode bij via je account — dan blijft je membership (en je inbegrepen sessie) gewoon doorlopen. We proberen het automatisch nog een paar keer.</p>`,
      cta: { href: `${SITE}/account`, label: "Betaalmethode bijwerken" },
    })
  );
}

// ---- Member: membership ended ----
export async function sendMembershipCancelled({ to, name }) {
  return send(
    to,
    "Je Fittin'-abonnement is stopgezet",
    shell({
      title: "Je abonnement is stopgezet",
      intro: `Hallo ${esc(name) || "daar"}, je maandabonnement is beëindigd. Je kan uiteraard gewoon sessies blijven boeken aan € 15, of op elk moment opnieuw member worden.`,
      body: `<p style="font-size:14px;color:#6b6685">Was dit niet de bedoeling of heb je vragen? Antwoord op deze mail — we helpen je graag verder.</p>`,
      cta: { href: `${SITE}/lidmaatschap`, label: "Opnieuw member worden" },
    })
  );
}

// ---- Member: a payment was refunded ----
export async function sendPaymentRefunded({ to, name, description, amountCents }) {
  return send(
    to,
    "Je betaling is terugbetaald",
    shell({
      title: "Terugbetaling onderweg 💶",
      intro: `Hallo ${esc(name) || "daar"}, we hebben een betaling aan jou terugbetaald:`,
      rows: [
        ["Omschrijving", esc(description || "Betaling")],
        ["Bedrag", eurTxt(amountCents)],
      ],
      body: `<p style="font-size:14px;color:#6b6685">Het bedrag staat — afhankelijk van je bank — binnen 5 à 10 werkdagen terug op je rekening. Vragen? Antwoord gewoon op deze mail.</p>`,
      cta: { href: `${SITE}/account`, label: "Mijn account" },
    })
  );
}

// ---- Member/coach: purchase receipt (punch card, coach credits) ----
// `invoiceUrl` maakt dit een volwaardige SaaS-bon (owner-vraag 2026-08-16, naar het voorbeeld van
// Stripe's "Invoice paid"-mail): de factuur is één klik vanuit de mail, niet iets dat je in je
// account moet gaan zoeken. Het factuurnummer wordt bij die eerste open automatisch toegekend.
export async function sendPurchaseReceipt({ to, name, description, amountCents, balanceLine, invoiceUrl }) {
  return send(
    to,
    "Bedankt voor je aankoop bij Fittin' ✅",
    shell({
      title: "Aankoop bevestigd ✅",
      intro: `Hallo ${esc(name) || "daar"}, bedankt! Dit is je bevestiging:`,
      rows: [
        ["Aankoop", esc(description || "Aankoop")],
        ["Bedrag", eurTxt(amountCents)],
        ...(balanceLine ? [["Saldo", esc(balanceLine)]] : []),
      ],
      body: invoiceUrl
        ? `<p style="font-size:14px;color:#6b6685">Je factuur (met btw-detail) staat voor je klaar — en blijft ook altijd beschikbaar in je account onder Betalingen.</p>`
        : `<p style="font-size:14px;color:#6b6685">Je betaalbewijs kan je altijd downloaden in je account onder Betalingen.</p>`,
      cta: invoiceUrl ? { href: invoiceUrl, label: "Bekijk je factuur →" } : { href: `${SITE}/boeken`, label: "Sessie boeken" },
    }),
    undefined, undefined,
    "purchase_receipt"
  );
}

// ---- Member: paid credits about to expire ----
export async function sendCreditsExpiring({ to, name, count, date }) {
  return send(
    to,
    `Je ${count === 1 ? "sessie vervalt" : "sessies vervallen"} binnenkort ⏳`,
    shell({
      title: "Niet vergeten te trainen 💪",
      intro: `Hallo ${esc(name) || "daar"}, ${count === 1 ? "1 sessie van je saldo vervalt" : `${count} sessies van je saldo vervallen`} op ${esc(date)}. Boek ze in en laat niets verloren gaan!`,
      cta: { href: `${SITE}/boeken`, label: "Sessie boeken" },
    }),
    FROM_BOOKING
  );
}

// ---- Member: sessietegoed is op (overgang 1 → 0) ----
// Zelfde lijn als sendCreditsExpiring, maar het omgekeerde moment: niets vervalt, er is gewoon
// niets meer. Bewust één mail, en enkel wanneer er niets gepland staat (zie reminders.js) — wie
// net met zijn laatste beurt boekte, las het al in zijn bevestigingsmail.
export async function sendCreditsEmpty({ to, name }) {
  return send(
    to,
    "Je sessiesaldo is op — zo boek je verder",
    shell({
      title: "Je saldo staat op 0",
      intro: `Hallo ${esc(name) || "daar"}, je laatste sessie van je saldo is opgebruikt. Niets aan de hand — je kan gewoon verder boeken, dit zijn je opties:`,
      rows: [
        ["Losse sessie", "€ 15 per uur, niets vooraf"],
        ["10-beurtenkaart", "€ 150 · 11 sessies (10 + 1 gratis)"],
        ["Abonnement", "€ 12/mnd · 1 sessie inbegrepen, daarna alles aan € 12"],
      ],
      body: `<p style="font-size:14px;color:#6b6685">Geen haast en geen verplichting: een losse sessie boeken kan altijd, ook zonder saldo.</p>`,
      cta: { href: `${SITE}/lidmaatschap`, label: "Bekijk de opties" },
    }),
    FROM_BOOKING,
    undefined,
    "credits_op"
  );
}

// ---- Meegenodigde buddy/gast: korte dag-vooraf-herinnering ----
// Bewust korter dan de herinnering van de boeker: een genodigde betaalt niets, kan niets
// verplaatsen en krijgt géén deurcode — die komt bij wie boekte. Alles wat hij moet weten is
// wanneer, waar, en met wie hij binnengaat.
export async function sendGuestSessionReminder({ to, name, fromName, serviceName, startsAt, endsAt }) {
  return send(
    to,
    "Herinnering: je traint binnenkort mee bij Fittin'",
    shell({
      title: "Tot binnenkort in de zaal! 💪",
      intro: `Hallo ${esc(name) || "daar"}, ${esc(fromName) || "een Fittin'-lid"} nam je mee naar deze sessie:`,
      rows: [
        ["Sessie", esc(serviceName)],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt, endsAt)],
      ],
      body: `<p style="font-size:14px;color:#6b6685;margin-top:12px">De toegangscode gaat naar wie de zaal boekte — spreek dus af om samen binnen te gaan. Sportkledij en een drinkbus volstaan.</p>`,
    }),
    FROM_BOOKING
  );
}

// ---- PT prospect: intake request confirmation ----
export async function sendIntakeConfirmation({ to, name }) {
  return send(
    to,
    "We hebben je aanvraag goed ontvangen 💪",
    shell({
      title: "Je gratis intake is aangevraagd ✅",
      intro: `Hallo ${esc(name) || "daar"}, bedankt voor je interesse in personal training bij Fittin'!`,
      body: `<p style="font-size:14px;color:#6b6685">We nemen zo snel mogelijk (meestal binnen 1 werkdag) contact met je op om je gratis intake en proeftraining in te plannen. Volledig vrijblijvend.</p>`,
      cta: { href: `${SITE}/personal-training`, label: "Meer over personal training" },
    })
  );
}

// ---- Owner: new PT intake request (reply-to = the prospect, so replying answers them directly) ----
export async function sendIntakeNotice({ to, prospectName, prospectEmail, phone, goal }) {
  return send(
    to,
    `Nieuwe PT-intake aanvraag — ${prospectName}`,
    shell({
      title: "Nieuwe intake-aanvraag 🏋️",
      intro: "Iemand vroeg een gratis intake/proeftraining aan via fittin.be:",
      rows: [
        ["Naam", esc(prospectName)],
        ["E-mail", esc(prospectEmail)],
        ...(phone ? [["Telefoon", esc(phone)]] : []),
      ],
      body: `<p style="font-size:14px;color:#6b6685;white-space:pre-wrap">${esc(goal || "(geen doel/vraag ingevuld)")}</p><p style="font-size:13px;color:#9b97ab;margin-top:12px">Antwoord gewoon op deze mail — je antwoord gaat rechtstreeks naar ${esc(prospectEmail)}.</p>`,
    }),
    FROM,
    prospectEmail
  );
}

// ---- Member: booking moved to a new time ----
export async function sendBookingRescheduled({ to, name, serviceName, startsAt, endsAt }) {
  await send(
    to,
    "Je Fittin'-sessie is verplaatst",
    shell({
      title: "Je sessie is verplaatst ✅",
      intro: `Hallo ${esc(name) || "daar"}, je sessie staat nu op een nieuw moment:`,
      rows: [
        ["Sessie", esc(serviceName)],
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
  // Persoonlijk vs reserve is geen detail: de eerste vervalt vanzelf na de sessie, de tweede is de
  // vaste code van de gym en blijft altijd geldig. Wie dat niet weet, stuurt hem gedachteloos door.
  const codeCaption = personal ? "Jouw persoonlijke code" : "Reservecode";
  const codeNote = personal
    ? `<div style="font-size:11px;color:#6b6685;margin-top:8px">Deze code is voor jou en werkt enkel tijdens je sessie.</div>`
    : `<div style="font-size:11px;color:#b45309;margin-top:8px;font-weight:bold">Je persoonlijke code raakte niet aangemaakt, dus dit is de reservecode van de gym. Die blijft altijd geldig — hou hem voor jezelf en deel hem met niemand.</div>`;
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
      intro: `Hallo ${esc(name) || "daar"}, je sessie start zo meteen. Hier is alles om binnen te raken:`,
      rows: [
        ["Sessie", esc(serviceName)],
        ["Wanneer", dayLabel(startsAt)],
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
          <div style="margin-top:14px;border-top:1px solid #ece9f5;padding-top:12px">
            <p style="font-size:13px;color:#6b6685;margin:0;line-height:1.6">
              <b style="color:#22194F">Nood?</b> De gym is onbemand — bel bij een noodgeval <b style="color:#22194F">112</b>.
              De EHBO-kit hangt aan de muur bij de ingang. Adres voor de hulpdiensten:
              <b style="color:#22194F">${esc(address || "Aannemersstraat 186, 9040 Gent")}</b>.
            </p>
          </div>
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
      intro: `Hallo ${esc(name) || "daar"}, ${esc(coachName)} heeft een sessie voor je ingepland:`,
      rows: [
        ["Coach", esc(coachName)],
        ["Sessie", esc(serviceName)],
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
      intro: `Hallo ${esc(name) || "daar"}, ${esc(coachName)} is toegewezen als jouw coach. Samen werken jullie aan je doelen — je coach kan sessies voor je inplannen en je programma opvolgen.`,
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
    shell({ title: `Je bent nu ${label}`, intro: `Hallo ${esc(name) || "daar"}, ${extra}`, cta })
  );
}

// ---- Member: account created by admin (set-password link) ----
export async function sendWelcomeNewAccount({ to, name, link }) {
  await send(
    to,
    "Welkom bij Fittin' — stel je wachtwoord in",
    shell({
      title: "Welkom bij Fittin' 👋",
      intro: `Hallo ${esc(name) || "daar"}, er is een account voor je aangemaakt bij Fittin'. Stel hieronder je wachtwoord in en je kan meteen sessies boeken.`,
      body: `<p style="font-size:13px;color:#9b97ab;margin-top:14px">Werkt de knop niet? Plak deze link in je browser:<br>${link}</p>`,
      cta: { href: link, label: "Wachtwoord instellen" },
    })
  );
}

// ---- Member: Day-0 branded welcome (self-signups + Google — they get nothing else) ----
export async function sendWelcomeMember({ to, name }) {
  return send(
    to,
    "Welkom bij Fittin' 👋 Je eerste sessie is gratis",
    shell({
      title: "Welkom bij Fittin' 👋",
      intro: `Hallo ${esc(name) || "daar"}, leuk dat je er bent! Fittin' is een privégym in Gent — je reserveert de zaal helemaal voor jezelf (en wie je meebrengt). Geen lidgeld, je betaalt enkel voor je tijd.`,
      body: `
        <div style="margin:8px 0 4px;background:#f0f9f1;border-radius:14px;padding:14px 16px">
          <p style="margin:0;font-size:15px;font-weight:bold;color:#1a7d34">🎁 Je allereerste sessie is gratis</p>
          <p style="margin:6px 0 0;font-size:13px;color:#6b6685;line-height:1.5">Ze wordt automatisch verrekend wanneer je je eerste sessie boekt — je hoeft geen code in te vullen.</p>
        </div>
        <div style="margin-top:16px">
          <p style="font-size:14px;font-weight:bold;color:#22194F;margin:0 0 6px">Zo werkt het</p>
          <ol style="font-size:13px;color:#6b6685;margin:0;padding-left:18px;line-height:1.7">
            <li>Kies een uur dat past en reserveer in de app.</li>
            <li>± 5 minuten voor je sessie krijg je je persoonlijke toegangscode — per mail én in de app.</li>
            <li>Toets de code in op het paneel naast de voordeur. De toegang werkt enkel tijdens jouw slot.</li>
          </ol>
        </div>`,
      cta: { href: `${SITE}/boeken`, label: "Boek je gratis sessie" },
    })
  );
}

// ---- Member: post-first-session follow-up (highest-ROI conversion beat) ----
export async function sendFirstSessionFollowup({ to, name }) {
  return send(
    to,
    "Hoe was je eerste sessie bij Fittin'? 💪",
    shell({
      title: "Hoe was het? 💪",
      intro: `Hallo ${esc(name) || "daar"}, je hebt je eerste sessie bij Fittin' erop zitten — proficiat! We hopen dat het goed voelde. Klaar voor de volgende?`,
      body: `
        <div style="margin:8px 0;border-top:1px solid #ece9f5;padding-top:14px">
          <p style="font-size:14px;font-weight:bold;color:#22194F;margin:0 0 8px">Wat past het best bij jou?</p>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:5px 12px 5px 0;font-size:14px;color:#6b6685">Losse sessie</td><td style="font-weight:bold;font-size:14px">€15</td></tr>
            <tr><td style="padding:5px 12px 5px 0;font-size:14px;color:#6b6685">10-beurtenkaart (10 + 1 gratis)</td><td style="font-weight:bold;font-size:14px">€150 · ±€13,64/sessie</td></tr>
            <tr><td style="padding:5px 12px 5px 0;font-size:14px;color:#6b6685">Abonnement</td><td style="font-weight:bold;font-size:14px">€12/mnd · alle sessies aan €12</td></tr>
          </table>
          <p style="font-size:12px;color:#9b97ab;margin:8px 0 0">Geen verplichtingen — kies gewoon wat voor jou klopt.</p>
        </div>`,
      cta: { href: `${SITE}/boeken`, label: "Boek je volgende sessie" },
    })
  );
}

// ---- Guest (non-member buddy) → member funnel: day-after "kom zelf trainen" ----
export async function sendGuestFollowup({ to, inviterName, signupUrl }) {
  return send(
    to,
    "Hoe was het trainen bij Fittin'? Je eerste eigen sessie is gratis 🎁",
    shell({
      title: "Kom terug — nu voor jezelf 🎁",
      intro: `Je trainde onlangs mee bij Fittin'${inviterName ? ` met ${esc(inviterName)}` : ""} in onze privégym in Gent. Leuk dat je erbij was! Zin om zelf de zaal te reserveren?`,
      body: `
        <div style="margin:8px 0 4px;background:#f0f9f1;border-radius:14px;padding:14px 16px">
          <p style="margin:0;font-size:15px;font-weight:bold;color:#1a7d34">🎁 Je eerste eigen sessie is gratis</p>
          <p style="margin:6px 0 0;font-size:13px;color:#6b6685;line-height:1.5">Maak een account en je gratis sessie staat automatisch klaar. Geen lidgeld, je betaalt enkel voor je tijd.</p>
        </div>`,
      cta: { href: signupUrl, label: "Maak je account" },
    })
  );
}

// ---- Member: a waitlisted slot just freed up ----
export async function sendWaitlistOpen({ to, name, serviceName, startsAt, bookUrl }) {
  return send(
    to,
    "Er is een plek vrij bij Fittin' 🎉",
    shell({
      title: "Een plek is vrijgekomen 🎉",
      intro: `Hallo ${esc(name) || "daar"}, het uur waarvoor je op de wachtlijst stond is net vrijgekomen. Wees er snel bij — wie eerst boekt, heeft de plek.`,
      rows: [
        ["Sessie", esc(serviceName || "Sessie")],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt)],
      ],
      cta: { href: bookUrl, label: "Boek dit uur" },
    }),
    FROM_BOOKING
  );
}

// ---- Admin: a coach requested session credits (needs approval — money is waiting) ----
export async function sendCoachRequestNotice({ to, coachName, qty, note }) {
  return send(
    to,
    `${coachName} vraagt ${qty} coach-sessies aan`,
    shell({
      title: "Sessie-aanvraag van een coach 🏋️",
      intro: `${esc(coachName)} vraagt <b>${qty} sessies</b> (€ ${(qty * 12).toFixed(2).replace(".", ",")}) aan om via factuur/overschrijving te betalen.`,
      rows: [
        ["Coach", esc(coachName)],
        ["Aantal", `${qty} sessies`],
        ["Bedrag", `€ ${(qty * 12).toFixed(2).replace(".", ",")}`],
        ...(note ? [["Opmerking", esc(note)]] : []),
      ],
      body: `<p style="font-size:13px;color:#6b6685;margin-top:10px">Keur goed of wijs af — bij goedkeuring wordt het tegoed bijgeschreven en verschijnt er een openstaande post bij Betalingen waarvoor je meteen een factuur kan maken.</p>`,
      cta: { href: `${SITE}/beheer/coaches#aanvragen`, label: "Bekijk de aanvraag" },
    }),
    FROM,
    REPLY_TO,
    "coach_request"
  );
}

// ---- Member: event signup confirmed ----
export async function sendEventSignup({ to, name, title, startsAt }) {
  await send(
    to,
    `Inschrijving bevestigd: ${title}`,
    shell({
      title: "Je bent ingeschreven 🎉",
      intro: `Hallo ${esc(name) || "daar"}, je inschrijving is bevestigd:`,
      rows: [
        ["Event", esc(title)],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt)],
      ],
      cta: { href: `${SITE}/community`, label: "Naar community" },
    })
  );
}

// ---- Member: day-before session reminder ----
export async function sendSessionReminder({ to, name, serviceName, startsAt, endsAt, coachName, bookingId, address }) {
  return send(
    to,
    "Herinnering: je Fittin'-sessie is binnenkort",
    shell({
      title: "Tot binnenkort in de zaal! 💪",
      intro: `Hallo ${esc(name) || "daar"}, een kleine herinnering voor je geplande sessie${coachName ? ` met ${esc(coachName)}` : ""}:`,
      rows: [
        ["Sessie", esc(serviceName)],
        ["Wanneer", dayLabel(startsAt)],
        ["Uur", timeRange(startsAt, endsAt)],
      ],
      body: `<p style="font-size:14px;color:#6b6685;margin-top:12px">Je toegangscode komt automatisch ± 5 minuten voor de start binnen. Kan je toch niet? Je kan je sessie tot 6u vooraf verplaatsen in je account. Nog niet in je agenda? Het item zit in bijlage.</p>`,
      cta: { href: `${SITE}/account`, label: "Mijn sessies" },
    }),
    FROM_BOOKING,
    REPLY_TO,
    null,
    // Zelfde UID als in de bevestigingsmail: wie het bestand toen al toevoegde, krijgt hier geen
    // tweede afspraak maar dezelfde — wie het toen niet deed, krijgt een laatste kans.
    [icsAttachment({ id: bookingId, startsAt, endsAt, serviceName, address })].filter(Boolean)
  );
}

// ---- Coach: session-credits granted by the superadmin ----
export async function sendCoachSessionsGranted({ to, name, qty }) {
  await send(
    to,
    "Je coach-sessies zijn goedgekeurd",
    shell({
      title: `+${qty} coach-sessie${qty > 1 ? "s" : ""} toegekend ✅`,
      intro: `Hallo ${esc(name) || "coach"}, de beheerder heeft je aanvraag goedgekeurd. Je kan nu sessies inplannen met je clienten.`,
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
      intro: `Hallo ${esc(name) || "daar"}, je sessiesaldo is ${up ? "verhoogd" : "verlaagd"} met ${Math.abs(delta)} sessie${Math.abs(delta) > 1 ? "s" : ""}.`,
      rows: [
        ...(reason ? [["Reden", esc(reason)]] : []),
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
      intro: `Hallo ${esc(name) || "daar"}, ${esc(coachName) || "je coach"} vraagt je om een sessie te betalen via het platform.`,
      rows: [
        ["Bedrag", eur],
        ...(description ? [["Omschrijving", esc(description)]] : []),
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
      intro: `Hallo ${esc(name) || "daar"}, ${esc(fromName)} heeft je meegenomen naar een Fittin'-sessie:`,
      rows: [
        ["Sessie", esc(serviceName)],
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
      intro: `${esc(fromName)} heeft je uitgenodigd voor een sessie bij Fittin' (Gent). Maak gratis een account om je plek te bevestigen:`,
      rows: [
        ["Sessie", esc(serviceName)],
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
      intro: `Hallo ${esc(name) || "daar"}, ${esc(fromName)} heeft de gym geboekt en vraagt of je meekomt:`,
      rows: [
        ["Sessie", esc(serviceName)],
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
      intro: `Hallo ${esc(name) || "daar"}, we hebben ${esc(buddyNames) || "je vrienden"} uitgenodigd voor jouw sessie:`,
      rows: [
        ["Sessie", esc(serviceName)],
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
      intro: `Hallo ${esc(name) || "daar"}, top dat je member wordt! Vanaf nu:`,
      rows: [
        ["Elke maand", "1 sessie inbegrepen (binnen de maand)"],
        ["Boekingstarief", "€ 12 i.p.v. € 15"],
        // "member-acties + voorrang bij events" beloofde iets wat nergens bestaat. De boekhorizon
        // (components/booking/BookingClient.jsx) is het enige extra dat het abo écht geeft.
        ["Extra", "Boek tot 8 weken vooruit (zonder abo: 2)"],
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
      intro: `Hallo ${esc(name) || "daar"}, ${esc(fromName)} heeft je buddy-aanvraag aanvaard. Neem elkaar mee naar een sessie — elk bezoek telt mee voor jullie stats.`,
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
      intro: `Hallo ${esc(name) || "daar"}, ${esc(fromName)} wil met jou connecten als trainingsbuddy op Fittin'. Buddies kunnen elkaar meenemen naar sessies.`,
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
      intro: `${esc(fromName)} nodigt je uit om samen te trainen bij Fittin' — een privégym in Gent. Maak een gratis account en je eerste uur is gratis — het wordt automatisch verrekend bij je eerste boeking.`,
      body: refCode ? `<p style="font-size:13px;color:#9b97ab;margin-top:10px">Gebruik bij registratie de vriendcode <b>${esc(refCode)}</b>.</p>` : "",
      cta: { href: url, label: "Account aanmaken" },
    })
  );
}

// S5 — persoonlijke abo-suggestie voor leden die vaak op eigen kosten trainen zonder abonnement.
// Visueel (e-mail-safe, inline CSS): besparing-hero, sessie-blokjes, prijsvergelijker met de
// Member-kolom uitgelicht. Max 1×/60 dagen per lid (afgedwongen door de caller via email_log).
export async function sendAboSuggestion({ to, name, sessions, losCount, creditCount, saving }) {
  const shown = Math.min(sessions, 12);
  const blocks = Array.from({ length: shown })
    .map(() => `<td style="padding:2px"><div style="width:22px;height:22px;border-radius:6px;background:#5FDA6B"></div></td>`)
    .join("");
  const extra = sessions > shown ? `<td style="padding:2px 6px;font-weight:800;color:#33B24A;font-size:13px">+${sessions - shown}</td>` : "";
  const parts = [
    losCount ? `${losCount} los betaald` : null,
    creditCount ? `${creditCount} met beurtenkaart` : null,
  ].filter(Boolean).join(" · ");
  const body = `
    <div style="margin:14px 0 4px;background:#f0fdf1;border:2px solid #5FDA6B;border-radius:14px;padding:16px 18px;text-align:center">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#33B24A;font-weight:bold">Jouw voordeel met het abonnement</div>
      <div style="font-size:34px;font-weight:800;color:#22194F;margin-top:4px">&asymp; &euro; ${saving}</div>
      <div style="font-size:12px;color:#6b6685;margin-top:2px">berekend op jouw eigen laatste 60 dagen</div>
    </div>
    <p style="margin:16px 0 6px;font-size:14px;color:#22194F"><b>Jouw sessies (laatste 60 dagen)</b></p>
    <table style="border-collapse:collapse"><tr>${blocks}${extra}</tr></table>
    <p style="margin:4px 0 0;font-size:12px;color:#6b6685">${sessions} sessies · ${parts}</p>
    <p style="margin:18px 0 6px;font-size:14px;color:#22194F"><b>Wat kost een sessie jou?</b></p>
    <table style="border-collapse:separate;border-spacing:6px 0;width:100%;text-align:center">
      <tr>
        <td style="width:33%;background:#f6f5fb;border-radius:12px;padding:12px 6px;vertical-align:top">
          <div style="font-size:12px;color:#6b6685">Losse sessie</div>
          <div style="font-size:20px;font-weight:800;color:#22194F">&euro; 15</div>
        </td>
        <td style="width:33%;background:#f6f5fb;border-radius:12px;padding:12px 6px;vertical-align:top">
          <div style="font-size:12px;color:#6b6685">Beurtenkaart</div>
          <div style="font-size:20px;font-weight:800;color:#22194F">&euro; 13,64</div>
        </td>
        <td style="width:33%;background:#22194F;border-radius:12px;padding:12px 6px;vertical-align:top">
          <div style="font-size:11px;color:#C6F24E;font-weight:bold">MEMBER &middot; &euro; 12/mnd</div>
          <div style="font-size:20px;font-weight:800;color:#ffffff">&euro; 12</div>
          <div style="font-size:11px;color:#B2ADC2">+ elke maand 1 sessie gratis</div>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#6b6685">Maandelijks opzegbaar, geen verplichtingen — je boekt gewoon zoals nu, alleen voordeliger. Je krijgt zo'n tip hoogstens één keer per twee maanden.</p>`;
  return send(
    to,
    `Jij traint vaak bij Fittin' — member zijn scheelt je ± € ${saving}`,
    shell({
      title: "Jij traint vaak. Word member? 💪",
      intro: `Hallo ${esc(name) || "daar"}, je trainde <b>${sessions}×</b> in de laatste 60 dagen — sterk bezig! Daarmee is het Member-abonnement voor jou de voordeligste formule:`,
      body,
      cta: { href: `${SITE}/lidmaatschap`, label: "Bekijk het abonnement →" },
    }),
    undefined,
    undefined,
    "abo_suggestie"
  );
}

// ---- Beheerder: wekelijks rapport ----
// Maandagochtend, over de week die net afgelopen is. De opbouw volgt bewust de volgorde waarin
// de eigenaar beslist: hoe ging het (met vergelijking), waar zit ruimte (bezetting), wie moet ik
// aanspreken (namen + links), en draait de machine nog (mails/crons). Blokken zonder inhoud
// worden weggelaten — een lege sectie leest als "hier is niets aan de hand" en dat is niet altijd waar.
// Opbouw en versturen staan apart zodat de HTML te renderen valt zonder iemand te mailen
// (scripts/preview-weekreport.mjs schrijft hem naar een bestand).
export function weekReportHtml({ name, report }) {
  const r = report;
  const periode = `${fmt(r.range.start, { day: "numeric", month: "long" })} – ${fmt(new Date(r.range.end.getTime() - 86400000), { day: "numeric", month: "long" })}`;

  // Eén zin bovenaan: wat is er deze week eigenlijk gebeurd?
  const dSess = r.sessions.now - r.sessions.prev;
  const kop = r.sessions.now === 0
    ? `Er werd deze week <b>geen enkele sessie</b> geboekt. Dat is het signaal om iets te doen — zie de actiepunten hieronder.`
    : `<b>${r.sessions.now} ${r.sessions.now === 1 ? "sessie" : "sessies"}</b> door <b>${r.unique.now} ${r.unique.now === 1 ? "lid" : "verschillende leden"}</b>, goed voor <b>${eur(r.revenue.now)}</b>.` +
      (dSess === 0 ? " Even druk als vorige week." : dSess > 0 ? ` Dat zijn er <b>${dSess} meer</b> dan vorige week.` : ` Dat zijn er <b>${Math.abs(dSess)} minder</b> dan vorige week.`);

  const stats = statGrid([
    { label: "Sessies", value: String(r.sessions.now), delta: delta(r.sessions.now, r.sessions.prev) },
    { label: "Omzet", value: eur(r.revenue.now), delta: delta(r.revenue.now, r.revenue.prev, { money: true }) },
    { label: "Actieve leden", value: String(r.unique.now), delta: delta(r.unique.now, r.unique.prev) },
    { label: "Nieuwe leden", value: String(r.members.now), delta: delta(r.members.now, r.members.prev) },
  ]);

  // ---- Verkeer: kwam er volk, en deed dat volk iets? ----
  // Twee regels, geen dashboard. Zonder deze cijfers is een slappe week niet te duiden: kwam er
  // minder volk, of haakte hetzelfde volk af? Leeg = onzichtbaar — mat de site niets, dan staat
  // er niets (een blok met nullen leest als "niemand kwam", en dat is niet hetzelfde).
  const t = r.traffic;
  const pct = t && t.prevVisitors > 0 ? Math.round(((t.visitors - t.prevVisitors) / t.prevVisitors) * 100) : null;
  const verkeer = t && t.visitors > 0
    ? sectionTitle("Bezoekers deze week", "")
      + calloutBox(
        `<b>${t.visitors} bezoekers</b> op de site`
        + (pct === null ? "" : ` — <b style="color:${pct >= 0 ? "#1a7d34" : "#b91c1c"}">${pct >= 0 ? "+" : ""}${pct}%</b> t.o.v. vorige week`)
        + `.<br><span style="font-size:13px;color:#6b6685">Daarvan kozen er <b style="color:#22194F">${t.chose}</b> een moment in de agenda en rondden er <b style="color:#22194F">${t.completed}</b> een boeking af.`
        + (t.topSource ? ` Sterkste externe bron: <b style="color:#22194F">${esc(t.topSource.host)}</b> (${t.topSource.views} weergaves).` : "")
        + `</span>`
      )
    : "";

  // ---- Bezetting: waar zit nog ruimte? ----
  const bezet = sectionTitle(
    "Bezetting per dag",
    "Aandeel van de open halve uren dat geboekt was. Lage dagen zijn je promotieruimte — de zaal staat er toch."
  ) + barChart(r.byDay, { unit: "%", highlight: (i) => i.value >= 50 })
    + (r.quietDays.length
      ? `<p style="margin:6px 0 0;font-size:12px;color:#6b6685;line-height:1.5">Rustig: <b style="color:#22194F">${r.quietDays.join(", ")}</b>. Een gerichte post of een tijdelijke actie op net die dag levert hier het meeste op.</p>`
      : "");

  const uren = r.busiestHours.length
    ? sectionTitle("Drukste uren", "Handig om te weten wanneer je best zelf aanwezig bent of een coach inplant.")
      + barChart(r.busiestHours, { unit: "×" })
    : "";

  // ---- Actiepunten: enkel wat een mens moet doen ----
  const acties = [];
  for (const c of r.coachDebt) {
    acties.push(actionItem({
      icon: "🧾",
      title: `${esc(c.name)} staat op ${String(c.sessions).replace(".", ",")} sessietegoed — € ${c.euros} te innen`,
      sub: "Boeken is voor deze coach geblokkeerd tot het saldo is aangezuiverd; op zijn dashboard staat een betaalknop klaar.",
      href: `${SITE}/beheer/coaches`, label: "Naar coaches",
    }));
  }
  for (const c of r.toInvoice || []) {
    acties.push(actionItem({
      icon: "📌",
      title: `${esc(c.name)}: ${eur(c.cents)} aan sessies nog niet gefactureerd`,
      sub: "Deze coach kan pas weer boeken zodra dit aangezuiverd is. Maak de factuur op bij Financiën; zodra de betaling geregistreerd staat, is hij meteen weer los.",
      href: `${SITE}/beheer/financien`, label: "Factureren",
    }));
  }
  for (const n of r.abo.pastDue) {
    acties.push(actionItem({
      icon: "💳",
      title: `Abo-betaling van ${esc(n)} is mislukt`,
      sub: "Stripe probeert automatisch opnieuw, maar tot dan betaalt dit lid weer € 15 per sessie. Eén berichtje om de kaart te vernieuwen volstaat meestal.",
      href: `${SITE}/beheer/leden`, label: "Naar leden",
    }));
  }
  for (const e of r.abo.ending) {
    acties.push(actionItem({
      icon: "👋",
      title: `${esc(e.name)} zegde het abonnement op`,
      sub: `Loopt af op ${e.until ? esc(dayLabel(e.until)) : "het einde van de periode"}. Vraag wat er scheelde — dat is de goedkoopste marktinfo die je krijgt.`,
      href: `${SITE}/beheer/leden`, label: "Naar leden",
    }));
  }
  if (r.candidates.length) {
    acties.push(actionItem({
      icon: "⭐",
      title: `${r.candidates.length} abo-kandida${r.candidates.length === 1 ? "at" : "ten"}: ${r.candidates.map((c) => `${esc(c.name)} (${c.sessions}×)`).join(", ")}`,
      sub: "Zij boeken vaak en betalen nog het volle tarief. De app toont hen automatisch hun besparing — een persoonlijk woordje in de zaal doet de rest.",
      href: `${SITE}/beheer/leden`, label: "Naar leden",
    }));
  }
  if (r.openReports) {
    acties.push(actionItem({
      icon: "🛠",
      title: `${r.openReports} openstaande melding${r.openReports === 1 ? "" : "en"} van leden`,
      sub: "Een gemelde panne die blijft liggen kost je stilzwijgend leden.",
      href: `${SITE}/beheer/meldingen`, label: "Naar meldingen",
    }));
  }
  if (r.openInvoiceCents > 0) {
    acties.push(actionItem({
      icon: "📄",
      title: `${eur(r.openInvoiceCents)} staat open op factuur`,
      sub: "Openstaande posten in Financiën — factureren of afboeken.",
      href: `${SITE}/beheer/financien`, label: "Naar financiën",
    }));
  }
  const actiesHtml = acties.length
    ? sectionTitle(`Wat jij deze week best doet (${acties.length})`, "Alleen dingen waar een mens voor nodig is — de rest doet de app zelf.") + acties.join("")
    : sectionTitle("Wat jij deze week best doet", "") + calloutBox("Niets dringends. Geen openstaande betalingen, geen mislukte abo's, geen meldingen. 👌", "good");

  // ---- Draait de machine? ----
  const machineOk = !r.health.mailsFailed && !r.health.accessCronBad && !r.health.activationCronBad;
  const machine = sectionTitle("Draait de app?", "")
    + (machineOk
      ? calloutBox(`De app verstuurde deze week <b>${r.health.mailsSent} mails</b> (bevestigingen, deurcodes, herinneringen, win-backs) — <b>geen enkele mislukt</b>. Deurcodes en dagelijkse taken liepen op tijd.`, "good")
      : calloutBox(
          `<b>Let op — iets loopt niet.</b><ul style="margin:8px 0 0;padding-left:18px;line-height:1.6">`
          + (r.health.mailsFailed ? `<li><b>${r.health.mailsFailed} mail(s) mislukt</b> deze week. Check Resend (domein, suppressielijst).</li>` : "")
          + (r.health.accessCronBad ? `<li><b>Deurcode-taak liep niet recent.</b> Leden kunnen daardoor zonder code voor de deur staan.</li>` : "")
          + (r.health.activationCronBad ? `<li><b>Dagelijkse taak liep niet.</b> Herinneringen en win-backs staan stil.</li>` : "")
          + `</ul>`, "warn"));

  // ---- Abonnementen, in één regel ----
  const abo = calloutBox(
    `<b>${r.abo.active} actieve abonnementen</b> · ${eur(r.abo.mrr)} vast per maand`
    + (r.abo.newAbos ? ` · <b style="color:#33B24A">${r.abo.newAbos} nieuw deze week</b>` : "")
    + (r.sessions.cancelled ? `<br><span style="font-size:12px;color:#6b6685">${r.sessions.cancelled} geannuleerde boeking${r.sessions.cancelled === 1 ? "" : "en"} deze week.</span>` : "")
  );

  return shell({
    title: `Je week in het kort`,
    intro: `${esc(name) ? `Hallo ${esc(name)}, ` : ""}dit is <b>${periode}</b>.<br>${kop}`,
    body: stats + abo + verkeer + bezet + uren + actiesHtml + machine,
    cta: { href: `${SITE}/beheer`, label: "Open het dashboard" },
  });
}

// ---- Beheerder: nieuwe app-fout gedetecteerd ----
// Dit alarm bestaat omdat Laura's boekingsfout een halve dag onbekeken in de logs stond. Het moet
// in één oogopslag antwoorden: wat is er stuk, waar, wie raakt het, en waar kijk ik verder.
export async function sendErrorAlert({ to, message, path, stack, count, userNames = [], firstSeen }) {
  const wie = userNames.length
    ? userNames.map((n) => esc(n)).join(", ")
    : "een niet-ingelogde bezoeker";
  return send(
    to,
    `🐛 Fout op ${path || "de site"} — ${userNames[0] ? esc(userNames[0]) : "bezoeker"} loopt vast`,
    shell({
      title: "Er gaat iets mis in de app",
      intro: `Sinds ${fmt(firstSeen, { hour: "2-digit", minute: "2-digit" })} loopt <b>${wie}</b> vast op <b>${esc(path || "?")}</b>${count > 1 ? ` — al <b>${count}×</b>` : ""}.`,
      body:
        `<pre style="background:#f6f5fb;border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.5;overflow:auto;white-space:pre-wrap;word-break:break-word">${esc(message)}</pre>` +
        (stack ? `<pre style="background:#f6f5fb;border-radius:10px;padding:12px 14px;font-size:10px;line-height:1.5;overflow:auto;white-space:pre-wrap;word-break:break-word;color:#6b6685;max-height:180px">${esc(String(stack).slice(0, 1200))}</pre>` : "") +
        calloutBox(
          `Dit is een automatische melding bij een <b>nieuwe</b> fout — verbindingsproblemen en browserextensies worden er niet uitgefilterd als vals alarm. Is de fout gefixt, vink ze dan af bij Meldingen; komt ze terug, dan krijg je opnieuw één mail.`,
        ),
      cta: { href: `${SITE}/beheer/meldingen#foutlogs`, label: "Bekijk de foutlogs" },
    }),
    undefined,
    undefined,
    "fout_alarm"
  );
}

export async function sendWeekReport({ to, name, report, gymName = "Fittin'" }) {
  return send(
    to,
    `Weekrapport ${gymName} · ${report.sessions.now} sessies, ${eur(report.revenue.now)}`,
    weekReportHtml({ name, report }),
    undefined,
    undefined,
    "week_rapport"
  );
}

// ---- Beheerder: batterij van het deurslot ----
// Door-kritiek en tijdgevoelig, dus bewust kaal en dwingend: wat is er aan de hand, hoe erg is het,
// wat moet je doen. Geen dashboard-CTA als hoofdactie — er valt niets te klikken, er moeten
// batterijen in.
export async function sendLockBatteryAlert({ to, gymName = "Fittin'", percent, critical, keypadCritical }) {
  const pct = Number.isFinite(percent) ? percent : null;
  const urgent = critical || keypadCritical || (pct != null && pct <= 10);
  const kleur = urgent ? "#dc2626" : pct != null && pct <= 20 ? "#d97706" : "#33B24A";

  // Batterijbalk als tabel — <progress> en inline svg overleven Gmail niet.
  const balk = pct != null
    ? `<table role="presentation" width="100%" style="border-collapse:collapse;margin:14px 0"><tr>
         <td style="padding:0">
           <table role="presentation" width="100%" style="border-collapse:collapse;background:#ece9f5;border-radius:6px">
             <tr><td width="${Math.max(2, pct)}%" style="background:${kleur};border-radius:6px;height:22px;font-size:0;line-height:22px">&nbsp;</td><td>&nbsp;</td></tr>
           </table>
         </td>
         <td width="70" style="padding-left:12px;font-size:26px;font-weight:800;color:${kleur};text-align:right;white-space:nowrap">${pct}%</td>
       </tr></table>`
    : "";

  const wat = keypadCritical
    ? `<b style="color:#dc2626">De batterij van het KEYPAD is bijna leeg.</b> Zodra dat paneel uitvalt werkt geen enkele code nog — ook de reservecode niet, en ook niet als het slot zelf nog vol zit.`
    : critical
      ? `<b style="color:#dc2626">Het slot meldt zijn batterij als kritiek.</b> Vervang de batterijen vandaag: valt het slot uit, dan raakt niemand nog binnen.`
      : `De batterij van het deurslot zakt richting leeg. Nu vervangen kost vijf minuten; te laat vervangen betekent leden die voor een dichte deur staan.`;

  return send(
    to,
    `${urgent ? "🔴" : "🔋"} Deurslot ${esc(gymName)}: batterij ${pct != null ? pct + "%" : "laag"}${keypadCritical ? " — keypad kritiek" : ""}`,
    shell({
      title: urgent ? "Vervang de batterijen van het slot" : "Batterij van het deurslot wordt laag",
      intro: wat,
      body: balk + calloutBox(
        `<b>Wat te doen</b><ol style="margin:8px 0 0;padding-left:18px;line-height:1.7">
           <li>Nieuwe batterijen in de Nuki Smart Lock${keypadCritical ? " én in het keypad naast de deur" : ""}.</li>
           <li>Test daarna één keer een code aan de deur.</li>
         </ol>
         <div style="margin-top:10px;font-size:12px;color:#6b6685">Je krijgt hierna pas opnieuw een mail als het niveau nóg een trap zakt, of als het kritiek wordt.</div>`,
        urgent ? "warn" : "neutral"
      ),
      cta: { href: `${SITE}/beheer/instellingen`, label: "Slotinstellingen bekijken" },
    }),
    undefined,
    undefined,
    "slot_batterij"
  );
}
