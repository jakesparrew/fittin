import { createAdminClient } from "@/lib/supabase/admin";

const KEY = process.env.RESEND_API_KEY;
// Alle inkomende klantmail wordt hierheen doorgestuurd (env-overridebaar; exported zodat
// andere owner-notificaties — bv. PT-intakes — dezelfde mailbox gebruiken).
export const FORWARD_TO = process.env.INBOX_FORWARD_TO || "ran.knockaert@gmail.com";
const escFwd = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isFittin = (addr) => /@(.*\.)?fittin\.be$/i.test(String(addr || ""));
const headerVal = (headers, name) => {
  if (!headers) return null;
  if (Array.isArray(headers)) { const h = headers.find((x) => (x.name || "").toLowerCase() === name); return h?.value || null; }
  return headers[name] || headers[name.toLowerCase()] || null;
};
const parseName = (from) => {
  const m = String(from || "").match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: String(from || "").trim() };
};
async function rfetch(path) {
  const r = await fetch("https://api.resend.com" + path, { headers: { Authorization: "Bearer " + KEY } });
  return r.json();
}

// Store one received email (by Resend id) if it's for an @fittin.be address and not yet stored.
export async function importReceived(gymId, resendId) {
  if (!KEY) return false;
  const admin = createAdminClient();
  const { data: have } = await admin.from("inbound_emails").select("id").eq("resend_id", resendId).maybeSingle();
  if (have) return false;
  const full = await rfetch("/emails/receiving/" + resendId);
  const to = (full.to || []).find(isFittin);
  if (!to) return false; // not for us (shared Resend account)
  const fromP = parseName(full.from);
  // Loop guard: never ingest our OWN outbound. The newsletter (nieuwsbrief@news.fittin.be), drips
  // and transactional mail (mail.fittin.be) reach the @fittin.be catch-all whenever they're sent to
  // an @fittin.be recipient (e.g. gaetan@fittin.be is on the list) — they are not customer mail and
  // would otherwise flood the superadmin inbox. Any @fittin.be sender is us, so drop it.
  if (isFittin(fromP.email)) return false;
  const { error } = await admin.from("inbound_emails").insert({
    gym_id: gymId,
    resend_id: resendId,
    from_email: fromP.email,
    from_name: fromP.name || null,
    to_email: to,
    subject: full.subject || "(geen onderwerp)",
    text_body: full.text || null,
    html_body: full.html || null,
    message_id: full.message_id || null,
    in_reply_to: headerVal(full.headers, "in-reply-to"),
    received_at: full.created_at || new Date().toISOString(),
  });

  // Forward a copy of every new incoming customer mail to Ran. Reply-to is the original sender, so
  // a reply from Ran lands straight in the customer's inbox. Best-effort: never block the import.
  if (!error && FORWARD_TO) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(KEY);
      const banner =
        `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555;background:#f6f5fb;border-radius:10px;padding:12px 14px;margin-bottom:14px">` +
        `📩 <b>Nieuwe mail aan Fittin'</b><br>` +
        `<b>Van:</b> ${escFwd(fromP.name)} &lt;${escFwd(fromP.email)}&gt;<br>` +
        `<b>Aan:</b> ${escFwd(to)}<br>` +
        `<b>Onderwerp:</b> ${escFwd(full.subject || "")}<br>` +
        `<span style="color:#888">Antwoord gewoon op deze mail — je antwoord gaat rechtstreeks naar de klant.</span></div>`;
      const orig = full.html
        || (full.text ? `<pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#22194F;margin:0">${escFwd(full.text)}</pre>` : "<p>(geen inhoud)</p>");
      await resend.emails.send({
        from: "Fittin' <info@fittin.be>",
        to: FORWARD_TO,
        replyTo: fromP.email || to,
        subject: full.subject || "(geen onderwerp)",
        html: banner + orig,
        headers: { "X-Fittin-Forward": "inbound" },
      });
    } catch (e) {
      console.error("inbound forward failed:", e?.message);
    }
  }
  return !error;
}

// Pull recent inbound mail from Resend and store any new @fittin.be messages.
export async function syncInbox(gymId, max = 40) {
  if (!KEY) return { error: "E-mail niet geconfigureerd." };
  const list = await rfetch("/emails/receiving");
  const items = (list?.data || []).filter((e) => (e.to || []).some(isFittin)).slice(0, max);
  let added = 0;
  for (const e of items) {
    if (await importReceived(gymId, e.id)) added++;
  }
  return { ok: true, added };
}

// Send a fresh email from one of the @fittin.be identities (inbox compose).
// `to` may be a single address or an array (multiple recipients).
export async function sendEmail({ from, to, subject, body }) {
  const { Resend } = await import("resend");
  const resend = new Resend(KEY);
  const safe = String(body || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#22194F;white-space:pre-wrap;font-size:15px;line-height:1.5">${safe}</div>`;
  return resend.emails.send({ from: `Fittin' <${from}>`, to, replyTo: from, subject, html });
}

// Reply to an inbound email from the same @fittin.be identity it was sent to.
export async function sendReply({ fromEmail, toEmail, subject, body, inReplyTo }) {
  const { Resend } = await import("resend");
  const resend = new Resend(KEY);
  const subj = /^re:/i.test(subject || "") ? subject : "Re: " + (subject || "");
  const safe = String(body || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#22194F;white-space:pre-wrap;font-size:15px;line-height:1.5">${safe}</div>`;
  return resend.emails.send({
    from: `Fittin' <${fromEmail}>`,
    to: toEmail,
    replyTo: fromEmail,
    subject: subj,
    html,
    ...(inReplyTo ? { headers: { "In-Reply-To": inReplyTo, References: inReplyTo } } : {}),
  });
}
