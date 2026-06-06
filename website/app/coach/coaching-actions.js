"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slotInstant } from "@/lib/time";

const num = (v, d = null) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const cents = (v) => Math.round(parseFloat(String(v || "0").replace(",", ".")) * 100) || 0;

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

// Inline "add new exercise" from the program builder — creates it and returns it so the picker
// can select it on the spot (no round-trip to the exercises page).
export async function coachQuickExercise(name) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const n = String(name || "").trim();
  if (!n) return { error: "Naam vereist." };
  const { data, error: e } = await supabase.from("exercises").insert({ gym_id: profile.gym_id, coach_id: userId, name: n }).select("id, name").single();
  if (e) return { error: e.message };
  revalidatePath("/coach/programmas");
  return { id: data.id, name: data.name };
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

// ---- Events (coach submits → admin approves) ----
export async function coachCreateEvent(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const date = formData.get("date");
  const hour = num(formData.get("hour"), 18);
  const dur = num(formData.get("duration_min"), 60);
  if (!formData.get("title") || !date) return { error: "Titel en datum zijn verplicht." };
  const start = slotInstant(date, hour);
  const end = new Date(start.getTime() + dur * 60000);
  const { error: e } = await supabase.from("events").insert({
    gym_id: profile.gym_id,
    title: formData.get("title"),
    description: formData.get("description") || null,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    capacity: num(formData.get("capacity"), 12),
    price_cents: cents(formData.get("price_eur")),
    status: "pending", // needs admin approval before it goes live
    coach_id: userId,
    created_by: userId,
  });
  if (e) return { error: e.message };
  revalidatePath("/coach/events");
  return { ok: true };
}

export async function coachDeleteEvent(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  // A coach can only remove their own event (and only while still pending).
  await supabase.from("events").delete().eq("id", formData.get("id")).eq("coach_id", userId).eq("status", "pending");
  revalidatePath("/coach/events");
}
