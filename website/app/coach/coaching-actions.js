"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const num = (v, d = null) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

// Coach-only guard (coaches manage their OWN exercises + program templates from /coach,
// never the admin /beheer area).
async function requireCoach() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase.from("profiles").select("id, gym_id, role").eq("id", user.id).single();
  if (!profile || !["coach", "beheerder"].includes(profile.role)) return { error: "Geen rechten." };
  return { supabase, profile, userId: user.id };
}

// ---- Exercises (coach's own library) ----
export async function coachUpsertExercise(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const id = formData.get("id");
  const row = {
    gym_id: profile.gym_id,
    coach_id: userId,
    name: formData.get("name"),
    muscle: formData.get("muscle") || null,
    video_url: formData.get("video_url") || null,
  };
  // Only let a coach edit their own exercise.
  const q = id ? supabase.from("exercises").update(row).eq("id", id).eq("coach_id", userId) : supabase.from("exercises").insert(row);
  const { error: e } = await q;
  if (e) return { error: e.message };
  revalidatePath("/coach/oefeningen");
}

export async function coachDeleteExercise(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  await supabase.from("exercises").delete().eq("id", formData.get("id")).eq("coach_id", userId);
  revalidatePath("/coach/oefeningen");
}

// ---- Programs (coach's own templates) ----
export async function coachCreateProgram(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const memberId = formData.get("memberId") || null;
  const { data, error: e } = await supabase
    .from("programs")
    .insert({ gym_id: profile.gym_id, coach_id: userId, member_id: memberId, name: formData.get("name") || "Nieuw programma", is_template: !memberId })
    .select("id")
    .single();
  if (e) return { error: e.message };
  await supabase.from("program_days").insert({ program_id: data.id, day_no: 1, name: "Dag 1" });
  redirect(`/coach/programmas/${data.id}`);
}

// Helper: confirm the program belongs to this coach before mutating it.
async function ownProgram(supabase, programId, userId) {
  const { data } = await supabase.from("programs").select("id, coach_id").eq("id", programId).single();
  return data && data.coach_id === userId;
}

export async function coachAddProgramDay(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const programId = formData.get("programId");
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  const { data: days } = await supabase.from("program_days").select("day_no").eq("program_id", programId);
  const next = (days || []).reduce((m, d) => Math.max(m, d.day_no), 0) + 1;
  await supabase.from("program_days").insert({ program_id: programId, day_no: next, name: `Dag ${next}` });
  revalidatePath(`/coach/programmas/${programId}`);
}

export async function coachAddProgramExercise(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const programId = formData.get("programId");
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  await supabase.from("program_exercises").insert({
    program_day_id: formData.get("dayId"),
    exercise_id: formData.get("exerciseId"),
    sets: num(formData.get("sets")),
    reps: num(formData.get("reps")),
    rest_sec: num(formData.get("rest_sec")),
  });
  revalidatePath(`/coach/programmas/${programId}`);
}

export async function coachDeleteProgramExercise(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const programId = formData.get("programId");
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  await supabase.from("program_exercises").delete().eq("id", formData.get("id"));
  revalidatePath(`/coach/programmas/${programId}`);
}

export async function coachAssignProgram(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const programId = formData.get("programId");
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  const memberId = formData.get("memberId") || null;
  await supabase.from("programs").update({ member_id: memberId, is_template: !memberId }).eq("id", programId);
  revalidatePath(`/coach/programmas/${programId}`);
}

export async function coachDeleteProgram(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const programId = formData.get("id");
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  await supabase.from("programs").delete().eq("id", programId);
  redirect("/coach/programmas");
}
