import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { FROM_NEWS, REPLY_TO } from "@/lib/email";

const key = process.env.RESEND_API_KEY;
const resend = key ? new Resend(key) : null;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// Turn a plain-text body into simple HTML if the author didn't write tags.
function bodyToHtml(body) {
  const s = String(body || "").trim();
  if (s.includes("<") && /<\/?[a-z][\s\S]*>/i.test(s)) return s; // already HTML
  return s
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2550">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Branded newsletter shell — wider, editorial, with an unsubscribe footer + preheader.
export function newsletterHtml({ subject, preheader = "", body, unsubUrl }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f6fa">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>` : ""}
  <div style="background:#f5f6fa;padding:28px 0">
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #ece9f5">
      <div style="background:#22194F;padding:22px 32px">
        <span style="color:#fff;font-size:24px;font-weight:800;letter-spacing:-0.02em">Fittin<span style="color:#C6F24E">'</span></span>
      </div>
      <div style="padding:30px 32px;color:#22194F">
        ${subject ? `<h1 style="margin:0 0 18px;font-size:24px;line-height:1.2;color:#22194F">${subject}</h1>` : ""}
        ${bodyToHtml(body)}
      </div>
      <div style="padding:18px 32px;border-top:1px solid #ece9f5;color:#9b97ab;font-size:12px;line-height:1.6">
        Fittin' · Aannemersstraat 186, 9040 Gent · <a href="${SITE}" style="color:#9b97ab">fittin.be</a><br>
        Geen nieuwsbrieven meer? <a href="${unsubUrl}" style="color:#6b6685;text-decoration:underline">Uitschrijven</a>
      </div>
    </div>
  </div></body></html>`;
}

const unsubFor = (token) => `${SITE}/uitschrijven?token=${token}`;
const listHeaders = (token) => ({
  "List-Unsubscribe": `<${unsubFor(token)}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

// Send a one-off newsletter campaign to every active subscriber (resumable + deduped).
export async function sendNewsletterCampaign(campaignId) {
  if (!resend) return { error: "E-mail niet geconfigureerd." };
  const admin = createAdminClient();
  const { data: c } = await admin.from("campaigns").select("*").eq("id", campaignId).single();
  if (!c) return { error: "Campagne niet gevonden." };
  if (c.kind !== "newsletter") return { error: "Geen nieuwsbrief-campagne." };

  const [{ data: subs }, { data: existing }] = await Promise.all([
    admin.from("subscribers").select("id, email, name, unsub_token").eq("gym_id", c.gym_id).eq("status", "active"),
    admin.from("campaign_sends").select("subscriber_id").eq("campaign_id", campaignId),
  ]);
  const done = new Set((existing || []).map((e) => e.subscriber_id));
  const targets = (subs || []).filter((s) => !done.has(s.id));

  await admin.from("campaigns").update({ status: "sending", total: (subs || []).length }).eq("id", campaignId);

  let sent = 0;
  for (const part of chunk(targets, 100)) {
    const payload = part.map((s) => ({
      from: FROM_NEWS,
      to: s.email,
      replyTo: REPLY_TO,
      subject: c.subject || c.name,
      html: newsletterHtml({ subject: c.subject, preheader: c.preheader, body: c.body_html, unsubUrl: unsubFor(s.unsub_token) }),
      headers: listHeaders(s.unsub_token),
    }));
    let ids = [];
    try {
      const res = await resend.batch.send(payload);
      ids = res?.data?.data || res?.data || []; // Resend batch → { data: { data: [{id}] } }
    } catch (e) {
      console.error("newsletter batch failed:", e?.message);
    }
    const rows = part.map((s, i) => ({
      gym_id: c.gym_id,
      campaign_id: campaignId,
      subscriber_id: s.id,
      email: s.email,
      resend_id: ids[i]?.id || null,
      status: ids[i]?.id ? "sent" : "failed",
      sent_at: new Date().toISOString(),
    }));
    if (rows.length) await admin.from("campaign_sends").insert(rows);
    sent += rows.filter((r) => r.status === "sent").length;
  }

  await admin.from("campaigns").update({ status: "sent", sent, sent_at: new Date().toISOString() }).eq("id", campaignId);
  return { ok: true, sent };
}

// Enroll one subscriber into every active drip and schedule each step via Resend.
export async function enrollSubscriberInDrips(gymId, subscriber) {
  if (!resend) return;
  const admin = createAdminClient();
  const { data: drips } = await admin.from("campaigns").select("id").eq("gym_id", gymId).eq("kind", "drip").eq("status", "active");
  for (const d of drips || []) {
    const { error: enrErr } = await admin.from("drip_enrollments").insert({ gym_id: gymId, campaign_id: d.id, subscriber_id: subscriber.id });
    if (enrErr) continue; // already enrolled
    const { data: steps } = await admin.from("campaign_steps").select("*").eq("campaign_id", d.id).order("step_no");
    let total = 0;
    for (const step of steps || []) {
      const when = step.delay_hours > 0 ? new Date(Date.now() + step.delay_hours * 3600 * 1000).toISOString() : null;
      let id = null;
      try {
        const res = await resend.emails.send({
          from: FROM_NEWS,
          to: subscriber.email,
          replyTo: REPLY_TO,
          subject: step.subject,
          html: newsletterHtml({ subject: step.subject, body: step.body_html, unsubUrl: unsubFor(subscriber.unsub_token) }),
          headers: listHeaders(subscriber.unsub_token),
          ...(when ? { scheduledAt: when } : {}),
        });
        id = res?.data?.id || null;
      } catch (e) {
        console.error("drip step send failed:", e?.message);
      }
      await admin.from("campaign_sends").insert({
        gym_id: gymId,
        campaign_id: d.id,
        step_id: step.id,
        subscriber_id: subscriber.id,
        email: subscriber.email,
        resend_id: id,
        status: id ? (when ? "scheduled" : "sent") : "failed",
        scheduled_at: when,
        sent_at: when ? null : new Date().toISOString(),
      });
      total += 1;
    }
  }
}

// Convenience: enroll a freshly-created user (the profile trigger already made the subscriber row).
export async function enrollUserInDrips(userId) {
  try {
    const admin = createAdminClient();
    const { data: prof } = await admin.from("profiles").select("gym_id, email").eq("id", userId).single();
    if (!prof?.email) return;
    const { data: sub } = await admin
      .from("subscribers")
      .select("id, email, name, unsub_token")
      .eq("gym_id", prof.gym_id)
      .eq("email", prof.email.toLowerCase())
      .maybeSingle();
    if (sub) await enrollSubscriberInDrips(prof.gym_id, sub);
  } catch (e) {
    console.error("enrollUserInDrips:", e?.message);
  }
}

// Record a Resend webhook event against the matching send + bump campaign counters.
export async function recordResendEvent(type, emailId) {
  if (!emailId) return;
  const admin = createAdminClient();
  const { data: row } = await admin.from("campaign_sends").select("*").eq("resend_id", emailId).maybeSingle();
  if (!row) return;
  const now = new Date().toISOString();
  const map = {
    "email.delivered": { status: "delivered", col: "delivered" },
    "email.opened": { status: "opened", col: "opened", at: "opened_at" },
    "email.clicked": { status: "clicked", col: "clicked", at: "clicked_at" },
    "email.bounced": { status: "bounced", col: "bounced" },
    "email.complained": { status: "bounced", col: "bounced" },
  };
  const m = map[type];
  if (!m) return;

  // Only advance status forward & count an event type once per send.
  const rank = { queued: 0, scheduled: 0, sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 2, failed: 1 };
  const patch = {};
  if ((rank[m.status] ?? 0) >= (rank[row.status] ?? 0)) patch.status = m.status;
  if (m.at && !row[m.at]) patch[m.at] = now;
  const firstTime =
    (m.col === "opened" && !row.opened_at) ||
    (m.col === "clicked" && !row.clicked_at) ||
    (m.col === "delivered" && row.status !== "delivered") ||
    (m.col === "bounced" && row.status !== "bounced");
  if (Object.keys(patch).length) await admin.from("campaign_sends").update(patch).eq("id", row.id);
  if (firstTime) {
    const { data: c } = await admin.from("campaigns").select(m.col).eq("id", row.campaign_id).single();
    if (c) await admin.from("campaigns").update({ [m.col]: (c[m.col] || 0) + 1 }).eq("id", row.campaign_id);
  }
}

// On unsubscribe: flip the subscriber + cancel their pending drip sends in Resend.
export async function unsubscribeByToken(token) {
  const admin = createAdminClient();
  const { data: sub } = await admin.from("subscribers").select("id, gym_id, email").eq("unsub_token", token).maybeSingle();
  if (!sub) return { error: "Onbekende link." };
  await admin.from("subscribers").update({ status: "unsubscribed" }).eq("id", sub.id);
  // Cancel still-scheduled drip emails.
  const { data: pending } = await admin.from("campaign_sends").select("id, resend_id").eq("subscriber_id", sub.id).eq("status", "scheduled");
  for (const p of pending || []) {
    if (p.resend_id && resend) { try { await resend.emails.cancel(p.resend_id); } catch {} }
    await admin.from("campaign_sends").update({ status: "failed" }).eq("id", p.id);
  }
  await admin.from("drip_enrollments").update({ status: "cancelled" }).eq("subscriber_id", sub.id).eq("status", "active");
  return { ok: true, email: sub.email };
}
