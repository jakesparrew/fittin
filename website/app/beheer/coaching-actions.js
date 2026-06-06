"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";

const num = (v, d = null) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

// ---------------- Exercises ----------------
export async function upsertExercise(formData) {
  const { supabase, profile, error } = await requireStaff();
  if (error) return { error };
  const id = formData.get("id");
  const row = {
    gym_id: profile.gym_id,
    name: formData.get("name"),
    muscle: formData.get("muscle") || null,
    video_url: formData.get("video_url") || null,
  };
  const q = id ? supabase.from("exercises").update(row).eq("id", id) : supabase.from("exercises").insert(row);
  const { error: e } = await q;
  if (e) return { error: e.message };
  revalidatePath("/beheer/oefeningen");
}

export async function deleteExercise(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("exercises").delete().eq("id", formData.get("id"));
  revalidatePath("/beheer/oefeningen");
}

// Inline "add new exercise" from the program builder — returns the created exercise.
export async function quickExercise(name) {
  const { supabase, profile, error } = await requireStaff();
  if (error) return { error };
  const n = String(name || "").trim();
  if (!n) return { error: "Naam vereist." };
  const { data, error: e } = await supabase.from("exercises").insert({ gym_id: profile.gym_id, name: n }).select("id, name").single();
  if (e) return { error: e.message };
  revalidatePath("/beheer/programmas");
  return { id: data.id, name: data.name };
}

// ---------------- Programs ----------------
export async function createProgram(formData) {
  const { supabase, profile, userId, error } = await requireStaff();
  if (error) return { error };
  const memberId = formData.get("memberId") || null;
  const { data, error: e } = await supabase
    .from("programs")
    .insert({
      gym_id: profile.gym_id,
      coach_id: userId,
      member_id: memberId || null,
      name: formData.get("name") || "Nieuw programma",
      is_template: !memberId,
    })
    .select("id")
    .single();
  if (e) return { error: e.message };
  // seed with one day
  await supabase.from("program_days").insert({ program_id: data.id, day_no: 1, name: "Dag 1" });
  revalidatePath("/beheer/programmas");
  redirect(`/beheer/programmas/${data.id}`);
}

export async function addProgramDay(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  const programId = formData.get("programId");
  const { data: days } = await supabase.from("program_days").select("day_no").eq("program_id", programId);
  const next = (days || []).reduce((m, d) => Math.max(m, d.day_no), 0) + 1;
  await supabase.from("program_days").insert({ program_id: programId, day_no: next, name: `Dag ${next}` });
  revalidatePath(`/beheer/programmas/${programId}`);
}

export async function addProgramExercise(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("program_exercises").insert({
    program_day_id: formData.get("dayId"),
    exercise_id: formData.get("exerciseId"),
    sets: num(formData.get("sets")),
    reps: num(formData.get("reps")),
    rest_sec: num(formData.get("rest_sec")),
  });
  revalidatePath(`/beheer/programmas/${formData.get("programId")}`);
}

export async function deleteProgramExercise(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("program_exercises").delete().eq("id", formData.get("id"));
  revalidatePath(`/beheer/programmas/${formData.get("programId")}`);
}

export async function assignProgram(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  await supabase
    .from("programs")
    .update({ member_id: formData.get("memberId") || null, is_template: !formData.get("memberId") })
    .eq("id", formData.get("programId"));
  revalidatePath(`/beheer/programmas/${formData.get("programId")}`);
}

export async function deleteProgram(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("programs").delete().eq("id", formData.get("id"));
  revalidatePath("/beheer/programmas");
}

// ---------------- Coach availability ----------------
export async function addCoachAvailability(formData) {
  const { supabase, profile, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("coach_availability").insert({
    gym_id: profile.gym_id,
    coach_id: formData.get("coachId"),
    weekday: num(formData.get("weekday"), 1),
    from_hour: num(formData.get("from_hour"), 9),
    to_hour: num(formData.get("to_hour"), 18),
  });
  revalidatePath("/beheer/coaches");
}

export async function deleteCoachAvailability(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("coach_availability").delete().eq("id", formData.get("id"));
  revalidatePath("/beheer/coaches");
}

// ---------------- Coach note on a member ----------------
export async function addSessionNote(formData) {
  const { supabase, profile, userId, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("session_notes").insert({
    gym_id: profile.gym_id,
    coach_id: userId,
    user_id: formData.get("memberId"),
    body: formData.get("body"),
  });
  revalidatePath(`/beheer/leden/${formData.get("memberId")}`);
}
