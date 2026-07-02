"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { runActivationCampaign } from "@/lib/activation";

const num = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

const SITE_ACT = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

export async function createActivation(formData) {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const trigger = formData.get("trigger_type") || "inactive";
  const { data, error: e } = await supabase
    .from("campaigns")
    .insert({
      gym_id: profile.gym_id,
      kind: "activation",
      name: formData.get("name") || "Activatie-campagne",
      trigger_type: trigger,
      trigger_params: { days: 10, min: 4, max: 1 },
      status: "draft",
      created_by: userId,
    })
    .select("id")
    .single();
  if (e) return { error: e.message };
  redirect(`/beheer/activatie/${data.id}`);
}

// Create a fully-configured activation in one go (from the step-by-step wizard).
export async function createActivationFull(formData) {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const trigger = formData.get("trigger_type") || "inactive";
  // Build trigger_params from whichever single param this segment uses.
  const paramKey = formData.get("param_key") || "";
  const paramVal = num(formData.get("param_value"), 0);
  const params = { days: 10, min: 4, max: 1 };
  if (paramKey) params[paramKey] = paramVal;
  const activate = formData.get("activate") === "on";
  const { data, error: e } = await supabase
    .from("campaigns")
    .insert({
      gym_id: profile.gym_id,
      kind: "activation",
      name: formData.get("name") || "Activatie-campagne",
      trigger_type: trigger,
      trigger_params: params,
      subject: formData.get("subject") || null,
      body_html: formData.get("body") || null,
      reward_credits: num(formData.get("reward_credits"), 0),
      discount_percent: Math.max(0, Math.min(100, num(formData.get("discount_percent"), 0))),
      cooldown_days: num(formData.get("cooldown_days"), 30),
      status: activate ? "active" : "draft",
      created_by: userId,
    })
    .select("id")
    .single();
  if (e) return { error: e.message };
  redirect(`/beheer/activatie/${data.id}`);
}

export async function updateActivation(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const paramKey = formData.get("param_key"); // days | min | max | (none)
  const params = {};
  if (paramKey) params[paramKey] = num(formData.get("param_value"), 0);
  await supabase
    .from("campaigns")
    .update({
      name: formData.get("name"),
      subject: formData.get("subject"),
      preheader: formData.get("preheader"),
      body_html: formData.get("body"),
      cooldown_days: num(formData.get("cooldown_days"), 30),
      reward_credits: num(formData.get("reward_credits"), 0),
      discount_percent: Math.max(0, Math.min(100, num(formData.get("discount_percent"), 0))),
      ...(paramKey ? { trigger_params: params } : {}),
    })
    .eq("id", id)
    .eq("kind", "activation");
  revalidatePath(`/beheer/activatie/${id}`);
  return { ok: true };
}

export async function setActivationStatus(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  await supabase.from("campaigns").update({ status: formData.get("status") }).eq("id", id).eq("kind", "activation");
  revalidatePath(`/beheer/activatie/${id}`);
  revalidatePath("/beheer/activatie");
  return { ok: true };
}

export async function runActivationNow(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const { data: own } = await supabase.from("campaigns").select("id").eq("id", id).maybeSingle(); // RLS scopes to gym
  if (!own) return { error: "Onbekende campagne." };
  const res = await runActivationCampaign(id);
  revalidatePath(`/beheer/activatie/${id}`);
  revalidatePath("/beheer/activatie");
  return res;
}

export async function deleteActivation(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  await supabase.from("campaigns").delete().eq("id", formData.get("id")).eq("kind", "activation");
  revalidatePath("/beheer/activatie");
  redirect("/beheer/activatie");
}

// Batch 2.5 — one-click win-back prefabs. Creates two ready-to-review DRAFT campaigns (honest tone,
// no pushy discounts): "We missen je" (inactive ≥14d) and "Abonnement gestopt" (lapsed member, +1
// reward credit). Owner reviews the copy, then flips one toggle to activate — the daily cron does the rest.
export async function createWinbackPrefabs() {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const drafts = [
    {
      name: "We missen je 👋",
      trigger_type: "inactive",
      trigger_params: { days: 14, min: 4, max: 1 },
      subject: "We missen je bij Fittin' 👋",
      body_html: `<p>Hey {{naam}}, we zagen je al even niet meer in de gym. Alles goed?</p><p>De zaal staat wanneer jij wil klaar — reserveer een uur dat past en pik gewoon weer op waar je gebleven was. Geen lidgeld, je betaalt enkel voor je tijd.</p><p><a href="${SITE_ACT}/boeken" style="background:#5fda6b;color:#22194f;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block">Boek een sessie</a></p>`,
      reward_credits: 0,
      cooldown_days: 45,
    },
    {
      name: "Abonnement gestopt — kom terug",
      trigger_type: "lapsed_member",
      trigger_params: { days: 10, min: 4, max: 1 },
      subject: "Je bent welkom terug bij Fittin' 💚",
      body_html: `<p>Hey {{naam}}, je abonnement is een tijdje geleden gestopt — geen probleem, dat hoort erbij.</p><p>Als welkom-terug zetten we <strong>1 gratis sessie</strong> voor je klaar. Kom eens langs, helemaal vrijblijvend. Boek gewoon een uur dat past en je gratis sessie wordt automatisch verrekend.</p><p><a href="${SITE_ACT}/boeken" style="background:#5fda6b;color:#22194f;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block">Kom terug trainen</a></p>`,
      reward_credits: 1,
      cooldown_days: 90,
    },
  ];
  let created = 0;
  for (const d of drafts) {
    // Skip if a prefab with this exact name already exists for the gym (idempotent — no duplicates).
    const { data: existing } = await supabase.from("campaigns").select("id").eq("gym_id", profile.gym_id).eq("kind", "activation").eq("name", d.name).maybeSingle();
    if (existing) continue;
    const { error: e } = await supabase.from("campaigns").insert({
      gym_id: profile.gym_id,
      kind: "activation",
      name: d.name,
      trigger_type: d.trigger_type,
      trigger_params: d.trigger_params,
      subject: d.subject,
      body_html: d.body_html,
      reward_credits: d.reward_credits,
      discount_percent: 0,
      cooldown_days: d.cooldown_days,
      status: "draft",
      created_by: userId,
    });
    if (!e) created++;
  }
  revalidatePath("/beheer/activatie");
  return { ok: true, created };
}
