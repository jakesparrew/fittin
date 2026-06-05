import { createAdminClient } from "@/lib/supabase/admin";

const KEY = process.env.RESEND_API_KEY;
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
