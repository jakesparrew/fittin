import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { FROM_NEWS, REPLY_TO } from "@/lib/email";
import { newsletterHtml } from "@/lib/newsletter";
import { ensureCampaignDiscountCode } from "@/lib/discounts";

const key = process.env.RESEND_API_KEY;
const resend = key ? new Resend(key) : null;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const days = (n) => n * 86400000;

// Behaviour segments the superadmin can trigger on. `match` runs against a member_engagement row.
export const SEGMENTS = {
  inactive: {
    label: "Inactief — al even niet geweest",
    desc: "Leden die wél al kwamen, maar de laatste X dagen niet meer.",
    param: { key: "days", label: "Dagen niet geweest", default: 10 },
    match: (m, p) => m.visits_total > 0 && (!m.last_visit || Date.now() - new Date(m.last_visit).getTime() >= days(p.days ?? 10)),
  },
  never_booked: {
    label: "Nog nooit geboekt",
    desc: "Leden met een account die nog nooit een sessie boekten.",
    param: null,
    match: (m) => (m.visits_total || 0) === 0,
  },
  momentum: {
    label: "Lekker bezig (momentum)",
    desc: "Leden die deze maand al X+ keer kwamen — vier het, hou ze vast.",
    param: { key: "min", label: "Min. sessies deze maand", default: 4 },
    match: (m, p) => (m.visits_this_month || 0) >= (p.min ?? 4),
  },
  low_credits: {
    label: "Sessies bijna op",
    desc: "Leden met een laag sessietegoed — zet aan tot bijkopen.",
    param: { key: "max", label: "Tegoed ≤", default: 1 },
    match: (m, p) => (m.credits ?? 0) <= (p.max ?? 1) && m.visits_total > 0,
  },
  lapsed_member: {
    label: "Abonnement gestopt",
    desc: "Leden die ooit een abonnement hadden maar nu niet meer.",
    param: null,
    match: (m) => (m.ever_memberships || 0) > 0 && (m.active_memberships || 0) === 0,
  },
};

const firstName = (n) => (n ? n.split(" ")[0] : "daar");
const personalize = (text, m, code = "") =>
  String(text || "")
    .replaceAll("{{naam}}", firstName(m.full_name))
    .replaceAll("{{name}}", firstName(m.full_name))
    .replaceAll("{{code}}", code || "");

// Members currently matching a campaign's trigger (active subscribers only → respects unsubscribe).
export async function evaluateMatches(admin, gymId, triggerType, params) {
  const seg = SEGMENTS[triggerType];
  if (!seg) return [];
  const [{ data: eng }, { data: subs }] = await Promise.all([
    admin.from("member_engagement").select("*").eq("gym_id", gymId),
    admin.from("subscribers").select("id, email, unsub_token, status").eq("gym_id", gymId).eq("status", "active"),
  ]);
  const subByEmail = new Map((subs || []).map((s) => [s.email.toLowerCase(), s]));
  const out = [];
  for (const m of eng || []) {
    if (!m.email) continue;
    const sub = subByEmail.get(m.email.toLowerCase());
    if (!sub) continue; // not an active subscriber
    if (seg.match(m, params || {})) out.push({ ...m, subscriber_id: sub.id, unsub_token: sub.unsub_token });
  }
  return out;
}

// Run one activation campaign: match → respect cooldown → send → (optional) grant credits → record.
export async function runActivationCampaign(campaignId, { force = false } = {}) {
  if (!resend) return { error: "E-mail niet geconfigureerd." };
  const admin = createAdminClient();
  const { data: c } = await admin.from("campaigns").select("*").eq("id", campaignId).single();
  if (!c || c.kind !== "activation") return { error: "Geen activatie-campagne." };

  const code = await ensureCampaignDiscountCode(c); // generate win-back code if discount_percent set
  const matches = await evaluateMatches(admin, c.gym_id, c.trigger_type, c.trigger_params);

  // Cooldown: skip members emailed by this campaign within cooldown_days.
  const cutoff = new Date(Date.now() - days(c.cooldown_days || 30)).toISOString();
  const { data: recent } = await admin
    .from("campaign_sends")
    .select("subscriber_id")
    .eq("campaign_id", campaignId)
    .gte("sent_at", cutoff);
  const skip = new Set((recent || []).map((r) => r.subscriber_id));
  const targets = force ? matches : matches.filter((m) => !skip.has(m.subscriber_id));

  let sent = 0;
  for (const part of chunk(targets, 100)) {
    const payload = part.map((m) => {
      const rewardLine = c.reward_credits > 0
        ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#33B24A;font-weight:bold">🎁 We zetten ${c.reward_credits} gratis sessie${c.reward_credits > 1 ? "s" : ""} op je account — boek 'm snel!</p>`
        : "";
      const discLine = c.discount_percent > 0 && code
        ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#22194F">Gebruik code <b style="background:#C6F24E;padding:2px 8px;border-radius:6px">${code}</b> voor <b>${c.discount_percent}% korting</b> op je volgende sessie.</p>`
        : "";
      const body = rewardLine + discLine + personalize(c.body_html, m, code);
      return {
        from: FROM_NEWS,
        to: m.email,
        replyTo: REPLY_TO,
        subject: personalize(c.subject || c.name, m, code),
        html: newsletterHtml({ subject: personalize(c.subject, m, code), preheader: c.preheader, body, unsubUrl: `${SITE}/uitschrijven?token=${m.unsub_token}` }),
        headers: { "List-Unsubscribe": `<${SITE}/uitschrijven?token=${m.unsub_token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      };
    });
    let ids = [];
    try {
      const res = await resend.batch.send(payload);
      ids = res?.data?.data || [];
    } catch (e) {
      console.error("activation batch failed:", e?.message);
    }
    const now = new Date().toISOString();
    const rows = part.map((m, i) => ({
      gym_id: c.gym_id,
      campaign_id: campaignId,
      subscriber_id: m.subscriber_id,
      email: m.email,
      resend_id: ids[i]?.id || null,
      status: ids[i]?.id ? "sent" : "failed",
      sent_at: now,
    }));
    if (rows.length) await admin.from("campaign_sends").insert(rows);
    // Grant the reward credits to the ones we actually emailed.
    if (c.reward_credits > 0) {
      const credited = part.filter((_, i) => ids[i]?.id).map((m) => ({ gym_id: c.gym_id, user_id: m.user_id, delta: c.reward_credits, reason: "activatie" }));
      if (credited.length) await admin.from("credits_ledger").insert(credited);
    }
    sent += rows.filter((r) => r.status === "sent").length;
  }

  await admin
    .from("campaigns")
    .update({ sent: (c.sent || 0) + sent, total: (c.total || 0) + targets.length, last_run_at: new Date().toISOString() })
    .eq("id", campaignId);
  return { ok: true, matched: matches.length, sent };
}

// Daily runner: every active activation campaign across all gyms.
export async function runAllActivations() {
  const admin = createAdminClient();
  const { data: camps } = await admin.from("campaigns").select("id").eq("kind", "activation").eq("status", "active");
  const results = [];
  for (const c of camps || []) {
    try {
      results.push({ id: c.id, ...(await runActivationCampaign(c.id)) });
    } catch (e) {
      results.push({ id: c.id, error: e?.message });
    }
  }
  return results;
}
