"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Log a member's sets for ONE exercise of a public workout (today). workout_logs RLS allows own-row
// writes; the program_exercise_id points at the (shared) public-workout exercise, but every log row
// is scoped to the member via user_id — so each member keeps their own history + PRs.
export async function logWorkoutSet(formData) {
  const peId = formData.get("programExerciseId");
  if (!peId) return { error: "Ontbrekende oefening." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Log in om je sets bij te houden." };
  const { data: me } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!me) return { error: "Geen profiel gevonden." };

  let sets = [];
  try { sets = JSON.parse(formData.get("sets") || "[]"); } catch {}
  sets = (Array.isArray(sets) ? sets : [])
    .map((s, i) => ({ set: i + 1, reps: Math.max(0, parseInt(s.reps, 10) || 0), weight_kg: Math.max(0, parseFloat(String(s.weight_kg).replace(",", ".")) || 0) }))
    .filter((s) => s.reps > 0);
  if (!sets.length) return { error: "Vul minstens 1 set in." };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const topW = Math.max(...sets.map((s) => s.weight_kg));
  const { data: prior } = await supabase.from("workout_logs").select("sets_json").eq("user_id", user.id).eq("program_exercise_id", peId);
  let priorMax = 0;
  for (const r of prior || []) {
    const arr = Array.isArray(r.sets_json) ? r.sets_json : [];
    for (const s of arr) priorMax = Math.max(priorMax, s.weight_kg || 0);
  }
  const isPr = topW > 0 && topW > priorMax;

  await supabase.from("workout_logs").delete().eq("user_id", user.id).eq("program_exercise_id", peId).eq("logged_on", today);
  const { error } = await supabase.from("workout_logs").insert({ gym_id: me.gym_id, user_id: user.id, program_exercise_id: peId, logged_on: today, sets_json: sets, is_pr: isPr });
  if (error) return { error: error.message };
  revalidatePath("/training");
  return { ok: true, isPr, message: isPr ? "Nieuw PR! 🔥" : "Set gelogd ✓" };
}

// Quick "done" toggle (no weights) for an exercise today.
export async function toggleWorkoutDone(formData) {
  const peId = formData.get("programExerciseId");
  const done = formData.get("done") === "true";
  if (!peId) return { error: "Ontbrekende oefening." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Log in om je workout bij te houden." };
  const { data: me } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!me) return { error: "Geen profiel gevonden." };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  if (done) {
    await supabase.from("workout_logs").delete().eq("user_id", user.id).eq("program_exercise_id", peId).eq("logged_on", today);
    const { error } = await supabase.from("workout_logs").insert({ gym_id: me.gym_id, user_id: user.id, program_exercise_id: peId, logged_on: today, sets_json: { done: true }, is_pr: false });
    if (error) return { error: error.message };
  } else {
    await supabase.from("workout_logs").delete().eq("user_id", user.id).eq("program_exercise_id", peId).eq("logged_on", today);
  }
  return { ok: true };
}

// Save a public workout into the member's own editable plans (copies the template).
export async function saveWorkoutToPlans(formData) {
  const programId = formData.get("programId");
  if (!programId) return { error: "Ontbrekende workout." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Log in om op te slaan in je plannen." };
  const { data, error } = await supabase.rpc("copy_template_to_member", { p_template: programId });
  if (error) return { error: error.message };
  revalidatePath("/plannen");
  return { ok: true, message: "Toegevoegd aan je plannen ✓", planId: data };
}
