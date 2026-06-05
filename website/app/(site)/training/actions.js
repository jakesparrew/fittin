"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function logWorkout(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!profile) return;

  const sets = parseInt(formData.get("sets"), 10) || null;
  const reps = parseInt(formData.get("reps"), 10) || null;
  const weight = parseFloat(String(formData.get("weight") || "").replace(",", ".")) || null;

  await supabase.from("workout_logs").insert({
    gym_id: profile.gym_id,
    user_id: user.id,
    program_exercise_id: formData.get("peId") || null,
    sets_json: { sets, reps, weight_kg: weight },
  });
  revalidatePath("/training");
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
