import { createAdminClient } from "@/lib/supabase/admin";

// Validate a discount code for a user + base price; returns the discounted amount.
export async function validateDiscount(gymId, userId, rawCode, baseCents) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { none: true, cents: baseCents };
  const admin = createAdminClient();
  const { data: dc } = await admin.from("discount_codes").select("*").eq("gym_id", gymId).eq("code", code).maybeSingle();
  if (!dc || !dc.active) return { error: "Ongeldige kortingscode." };
  if (dc.expires_at && new Date(dc.expires_at) < new Date()) return { error: "Deze kortingscode is verlopen." };
  if (dc.max_uses != null && dc.used_count >= dc.max_uses) return { error: "Deze kortingscode is niet meer geldig." };
  if (dc.per_user_once) {
    const { count } = await admin.from("discount_redemptions").select("id", { count: "exact", head: true }).eq("code_id", dc.id).eq("user_id", userId);
    if (count) return { error: "Je hebt deze code al gebruikt." };
  }
  const cents = Math.max(0, Math.round(baseCents * (1 - dc.percent / 100)));
  return { ok: true, codeId: dc.id, percent: dc.percent, cents, label: `${dc.percent}% korting` };
}

// Record a redemption + bump the use counter (called once the discounted checkout is created).
export async function recordRedemption(gymId, codeId, userId, bookingId) {
  const admin = createAdminClient();
  await admin.from("discount_redemptions").insert({ gym_id: gymId, code_id: codeId, user_id: userId, booking_id: bookingId });
  const { data: dc } = await admin.from("discount_codes").select("used_count").eq("id", codeId).single();
  await admin.from("discount_codes").update({ used_count: (dc?.used_count || 0) + 1 }).eq("id", codeId);
}

// Ensure an activation campaign with a win-back % has a generated, reusable discount code.
export async function ensureCampaignDiscountCode(campaign) {
  if (!campaign.discount_percent || campaign.discount_percent <= 0) return null;
  if (campaign.discount_code) return campaign.discount_code;
  const admin = createAdminClient();
  const base = (campaign.name || "FITTIN").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "FITTIN";
  const code = `${base}${campaign.discount_percent}`;
  await admin.from("discount_codes").upsert(
    { gym_id: campaign.gym_id, code, percent: campaign.discount_percent, per_user_once: true, active: true, campaign_id: campaign.id },
    { onConflict: "gym_id,code" }
  );
  await admin.from("campaigns").update({ discount_code: code }).eq("id", campaign.id);
  return code;
}
