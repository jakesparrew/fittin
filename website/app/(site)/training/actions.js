"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const toNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const topWeight = (sets_json) => {
  const arr = Array.isArray(sets_json) ? sets_json : sets_json ? [sets_json] : [];
  return arr.reduce((m, s) => Math.max(m, s?.weight_kg || 0), 0);
};

// Log a full set-by-set result for one program exercise (today). Replaces today's entry so a
// member can correct it, and flags a PR when the top set beats every previous session.
export async function logExercise(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!profile) return { error: "Geen profiel." };
  const peId = formData.get("peId");
  if (!peId) return { error: "Geen oefening." };

  let raw = [];
  try { raw = JSON.parse(formData.get("sets_json") || "[]"); } catch {}
  const sets = (Array.isArray(raw) ? raw : [])
    .map((s, i) => ({ set: i + 1, reps: toNum(s.reps), weight_kg: toNum(s.weight_kg) }))
    .filter((s) => s.reps != null || s.weight_kg != null);
  if (!sets.length) return { error: "Vul minstens één set in." };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const { data: prior } = await supabase
    .from("workout_logs").select("sets_json")
    .eq("user_id", user.id).eq("program_exercise_id", peId).neq("logged_on", today);
  const priorMax = (prior || []).reduce((m, r) => Math.max(m, topWeight(r.sets_json)), 0);
  const top = topWeight(sets);
  const isPr = top > 0 && top > priorMax; // strictly beat the previous best (first log: priorMax 0)

  await supabase.from("workout_logs").delete().eq("user_id", user.id).eq("program_exercise_id", peId).eq("logged_on", today);
  const { error } = await supabase.from("workout_logs").insert({
    gym_id: profile.gym_id, user_id: user.id, program_exercise_id: peId, sets_json: sets, is_pr: isPr,
  });
  if (error) return { error: error.message };
  revalidatePath("/training");
  return { ok: true, pr: isPr };
}

// Quick "done today" toggle for a program exercise — so coach + member see progress without
// needing to log full sets/reps. Toggling again un-marks it.
export async function toggleExerciseDone(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!profile) return;
  const peId = formData.get("peId");
  if (!peId) return;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const { data: existing } = await supabase
    .from("workout_logs")
    .select("id")
    .eq("user_id", user.id)
    .eq("program_exercise_id", peId)
    .eq("logged_on", today)
    .limit(1)
    .maybeSingle();
  if (existing) await supabase.from("workout_logs").delete().eq("id", existing.id);
  else await supabase.from("workout_logs").insert({ gym_id: profile.gym_id, user_id: user.id, program_exercise_id: peId, sets_json: { done: true } });
  revalidatePath("/training");
}
