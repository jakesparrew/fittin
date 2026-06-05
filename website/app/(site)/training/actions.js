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
