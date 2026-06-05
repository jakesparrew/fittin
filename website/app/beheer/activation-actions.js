"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { runActivationCampaign } from "@/lib/activation";

const num = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

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
  const { error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
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
