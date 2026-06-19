"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const clamp = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!profile) return { error: "Geen profiel." };
  return { supabase, user, gymId: profile.gym_id };
}

// Search the gym library for the plan-builder picker (RLS-scoped to the member's gym).
export async function searchExercises(q, category) {
  const { supabase, error } = await me();
  if (error) return [];
  let query = supabase
    .from("exercises")
    .select("id, name, slug, category, muscle, primary_muscles, equipment, image_url, frames")
    .order("name")
    .limit(40);
  if (category && category !== "alle") query = query.eq("category", category);
  const term = String(q || "").trim();
  if (term) query = query.ilike("name", `%${term}%`);
  const { data } = await query;
  return data || [];
}

export async function createPlan(formData) {
  const { supabase, user, gymId, error } = await me();
  if (error) return { error };
  const name = String(formData.get("name") || "").trim() || "Mijn plan";
  const { data, error: e } = await supabase
    .from("programs")
    .insert({ gym_id: gymId, member_id: user.id, name, is_template: false })
    .select("id").single();
  if (e) return { error: e.message };
  redirect(`/plannen/${data.id}`);
}

export async function renamePlan(formData) {
  const { supabase, user, error } = await me();
  if (error) return { error };
  const id = formData.get("id");
  await supabase.from("programs").update({ name: String(formData.get("name") || "").trim() || "Mijn plan" }).eq("id", id).eq("member_id", user.id);
  revalidatePath(`/plannen/${id}`);
  return { ok: true };
}

export async function deletePlan(formData) {
  const { supabase, user, error } = await me();
  if (error) return { error };
  await supabase.from("programs").delete().eq("id", formData.get("id")).eq("member_id", user.id);
  redirect("/plannen");
}

export async function setActivePlan(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  const { error: e } = await supabase.rpc("set_active_plan", { p_program: formData.get("id") });
  if (e) return { error: e.message };
  revalidatePath("/plannen");
  revalidatePath("/training");
  return { ok: true };
}

export async function copyTemplate(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  const { data: newId, error: e } = await supabase.rpc("copy_template_to_member", { p_template: formData.get("templateId") });
  if (e) return { error: e.message };
  redirect(`/plannen/${newId}`);
}

export async function addDay(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  const programId = formData.get("programId");
  const { error: e } = await supabase.rpc("add_plan_day", { p_program: programId, p_name: String(formData.get("name") || "").trim() || null });
  if (e) return { error: e.message };
  revalidatePath(`/plannen/${programId}`);
  return { ok: true };
}

export async function removeDay(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  const { error: e } = await supabase.from("program_days").delete().eq("id", formData.get("dayId"));
  if (e) return { error: e.message };
  revalidatePath(`/plannen/${formData.get("programId")}`);
  return { ok: true };
}

export async function addExerciseToDay(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  // Atomic ordinal + ownership + same-gym exercise check, all in the RPC.
  const { error: e } = await supabase.rpc("add_plan_exercise", { p_day: formData.get("dayId"), p_exercise: formData.get("exerciseId") });
  if (e) return { error: e.message };
  revalidatePath(`/plannen/${formData.get("programId")}`);
  return { ok: true };
}

export async function updatePlanExercise(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  const { error: e } = await supabase.from("program_exercises").update({
    sets: clamp(formData.get("sets"), 1, 20), reps: clamp(formData.get("reps"), 1, 100), rest_sec: clamp(formData.get("rest_sec"), 0, 600),
  }).eq("id", formData.get("peId"));
  if (e) return { error: e.message };
  revalidatePath(`/plannen/${formData.get("programId")}`);
  return { ok: true };
}

export async function removePlanExercise(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  const { error: e } = await supabase.from("program_exercises").delete().eq("id", formData.get("peId"));
  if (e) return { error: e.message };
  revalidatePath(`/plannen/${formData.get("programId")}`);
  return { ok: true };
}
