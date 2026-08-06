// Eenmalig: stuur binnengekomen mails MÉT hun bijlagen alsnog door naar de owner.
// Nodig omdat de doorstuur tot vandaag enkel de tekst meenam — de PDF's en XML's van de facturen
// bereikten hem dus nooit. Gebruikt exact dezelfde ophaal-en-verstuurlogica als lib/inbox.js.
//
//   node --env-file=.env.local scripts/forward-facturen.mjs <resend-email-id> [meer ids...]
import { Resend } from "resend";

const KEY = process.env.RESEND_API_KEY;
const TO = process.env.INBOX_FORWARD_TO || "ran.knockaert@gmail.com";
if (!KEY) { console.error("Geen RESEND_API_KEY."); process.exit(1); }
const ids = process.argv.slice(2);
if (!ids.length) { console.error("Geef één of meer Resend-email-id's mee."); process.exit(1); }

const H = { Authorization: `Bearer ${KEY}` };
const rf = async (p) => { const r = await fetch("https://api.resend.com" + p, { headers: H }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); };
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const parseName = (from) => { const m = String(from || "").match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/); return m ? { name: m[1].trim(), email: m[2].trim() } : { name: "", email: String(from || "").trim() }; };
const MAX = 38 * 1024 * 1024;

const resend = new Resend(KEY);
for (const id of ids) {
  const full = await rf("/emails/receiving/" + id);
  const from = parseName(full.from);
  const att = Array.isArray(full.attachments) ? full.attachments : [];

  const mee = []; let totaal = 0;
  for (const m of att) {
    const info = await rf(`/emails/receiving/${id}/attachments/${m.id}`);
    if (!info?.download_url) { console.log(`   ⚠ geen link voor ${m.filename}`); continue; }
    const buf = Buffer.from(await (await fetch(info.download_url)).arrayBuffer());
    if (totaal + buf.length > MAX) { console.log(`   ⚠ ${m.filename} overgeslagen (te groot samen)`); continue; }
    totaal += buf.length;
    mee.push({ filename: m.filename, content: buf.toString("base64"), contentType: m.content_type || undefined });
  }

  const banner =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#555;background:#f6f5fb;border-radius:10px;padding:12px 14px;margin-bottom:14px">` +
    `📩 <b>Nieuwe mail aan Fittin'</b> <span style="color:#b45309">(opnieuw doorgestuurd — nu mét bijlagen)</span><br>` +
    `<b>Van:</b> ${esc(from.name)} &lt;${esc(from.email)}&gt;<br>` +
    `<b>Aan:</b> ${esc(Array.isArray(full.to) ? full.to.join(", ") : full.to)}<br>` +
    `<b>Onderwerp:</b> ${esc(full.subject || "")}<br>` +
    `<b>Bijlagen:</b> ${mee.map((a) => esc(a.filename)).join(", ") || "geen"}<br>` +
    `<span style="color:#888">Antwoord gewoon op deze mail — je antwoord gaat rechtstreeks naar de afzender.</span></div>`;
  const orig = full.html || (full.text ? `<pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#22194F;margin:0">${esc(full.text)}</pre>` : "<p>(geen inhoud)</p>");

  const res = await resend.emails.send({
    from: "Fittin' <info@fittin.be>",
    to: TO,
    replyTo: from.email,
    subject: full.subject || "(geen onderwerp)",
    html: banner + orig,
    ...(mee.length ? { attachments: mee } : {}),
    headers: { "X-Fittin-Forward": "inbound-backfill" },
  });
  if (res?.error) console.error(`✗ ${full.subject}: ${res.error.message || JSON.stringify(res.error)}`);
  else console.log(`✓ ${full.subject} → ${TO} · ${mee.length} bijlage(n), ${Math.round(totaal / 1024)} kB`);
}
