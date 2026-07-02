import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Validate a discount code for a user + base price; returns the discounted amount.
export async function validateDiscount(gymId, userId, rawCode, baseCents) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { none: true, cents: baseCents };
  const admin = createAdminClient();
  const { data: dc } = await admin.from("discount_codes").select("*").eq("gym_id", gymId).eq("code", code).maybeSingle();
  if (!dc || !dc.active) return { error: "Ongeldige kortingscode." };
  if (dc.user_id && dc.user_id !== userId) return { error: "Deze kortingscode is niet voor jouw account." };
  if (dc.expires_at && new Date(dc.expires_at) < new Date()) return { error: "Deze kortingscode is verlopen." };
  if (dc.max_uses != null && dc.used_count >= dc.max_uses) return { error: "Deze kortingscode is niet meer geldig." };
  if (dc.per_user_once) {
    const { count } = await admin.from("discount_redemptions").select("id", { count: "exact", head: true }).eq("code_id", dc.id).eq("user_id", userId);
    if (count) return { error: "Je hebt deze code al gebruikt." };
  }
  const cents = dc.amount_cents != null
    ? Math.max(0, baseCents - dc.amount_cents)
    : Math.max(0, Math.round(baseCents * (1 - (dc.percent || 0) / 100)));
  const label = dc.amount_cents != null
    ? `€ ${(dc.amount_cents / 100).toFixed(2).replace(".", ",")} korting`
    : `${dc.percent}% korting`;
  return { ok: true, codeId: dc.id, percent: dc.percent, amountCents: dc.amount_cents, cents, label };
}

// Record a redemption + bump the use counter (called once the discounted checkout is created).
export async function recordRedemption(gymId, codeId, userId, bookingId) {
  const admin = createAdminClient();
  await admin.from("discount_redemptions").insert({ gym_id: gymId, code_id: codeId, user_id: userId, booking_id: bookingId });
  // Guarded compare-and-set instead of read-modify-write, so two concurrent redemptions of a
  // max_uses=1 code can't both slip under the cap (TOCTOU race).
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: dc } = await admin.from("discount_codes").select("used_count, max_uses").eq("id", codeId).single();
    if (!dc) return;
    if (dc.max_uses != null && dc.used_count >= dc.max_uses) return; // already at cap
    const { data: updated } = await admin
      .from("discount_codes")
      .update({ used_count: dc.used_count + 1 })
      .eq("id", codeId)
      .eq("used_count", dc.used_count) // CAS: only wins if nobody bumped in between
      .select("id");
    if (updated && updated.length) return;
  }
  console.error("recordRedemption: CAS failed after 3 attempts", codeId);
}

// Per-recipient discount code for an activation campaign: deterministic per (campaign, member),
// bound to that member (a leaked code can't be used by anyone else). Idempotent across re-runs.
export async function ensureRecipientCode(campaign, userId) {
  if (!campaign.discount_percent || campaign.discount_percent <= 0) return null;
  const admin = createAdminClient();
  const base = (campaign.name || "FITTIN").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "FITTIN";
  const suffix = crypto.createHash("sha1").update(campaign.id + ":" + userId).digest("hex").slice(0, 5).toUpperCase();
  const code = `${base}${suffix}`;
  await admin.from("discount_codes").upsert(
    { gym_id: campaign.gym_id, code, percent: campaign.discount_percent, per_user_once: true, max_uses: 1, active: true, campaign_id: campaign.id, user_id: userId },
    { onConflict: "gym_id,code" }
  );
  return code;
}
