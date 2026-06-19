"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slotInstant } from "@/lib/time";
import { logCoachActivity } from "@/lib/coachlog";
import { notify, notifyAdmins } from "@/lib/notify";
import { uploadEventImage, parseFaq } from "@/lib/eventmedia";
import { exerciseRowFromForm } from "@/lib/exercise-fields";

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
  if (!String(formData.get("name") || "").trim()) return { error: "Naam is verplicht." };
  const row = await exerciseRowFromForm(supabase, formData, profile.gym_id, { coach_id: userId }, id || null);
  // Only let a coach edit their own exercise.
  const q = id ? supabase.from("exercises").update(row).eq("id", id).eq("coach_id", userId) : supabase.from("exercises").insert(row);
  const { error: e } = await q;
  if (e) return { error: e.message };
  revalidateTag("coaches"); // (no-op for the public list, but keeps tag usage consistent)
  revalidateTag("exercises");
  revalidatePath("/coach/oefeningen");
  return { ok: true, message: "Oefening opgeslagen ✓" };
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
  // Verify the day actually belongs to this (owned) program — don't trust the hidden dayId.
  const dayId = formData.get("dayId");
  const { data: day } = await supabase.from("program_days").select("id").eq("id", dayId).eq("program_id", programId).maybeSingle();
  if (!day) return { error: "Ongeldige dag." };
  await supabase.from("program_exercises").insert({
    program_day_id: dayId,
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
  // Verify the exercise row hangs off a day of THIS program before deleting.
  const exId = formData.get("id");
  const { data: pe } = await supabase.from("program_exercises").select("program_day_id").eq("id", exId).maybeSingle();
  if (!pe) return { error: "Niet gevonden." };
  const { data: pd } = await supabase.from("program_days").select("id").eq("id", pe.program_day_id).eq("program_id", programId).maybeSingle();
  if (!pd) return { error: "Geen toegang." };
  await supabase.from("program_exercises").delete().eq("id", exId);
  revalidatePath(`/coach/programmas/${programId}`);
}

export async function coachAssignProgram(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const programId = formData.get("programId");
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  const memberId = formData.get("memberId") || null;

  // No member → detach back to a reusable template.
  if (!memberId) {
    await supabase.from("programs").update({ member_id: null, is_template: true }).eq("id", programId).eq("coach_id", userId);
    revalidatePath(`/coach/programmas/${programId}`);
    return { ok: true };
  }

  // Only assign to your OWN client.
  const { data: link } = await supabase.from("coach_clients").select("id").eq("coach_id", userId).eq("client_id", memberId).maybeSingle();
  if (!link) return { error: "Dit is niet jouw client." };

  // Clone the program into a per-member copy so the template stays reusable and a previously
  // assigned member keeps their own copy (assigning is a COPY, per the spec — not a move).
  const { data: tmpl } = await supabase.from("programs").select("name").eq("id", programId).single();
  const { data: copy, error: cErr } = await supabase
    .from("programs")
    .insert({ gym_id: profile.gym_id, coach_id: userId, member_id: memberId, name: tmpl?.name || "Programma", is_template: false })
    .select("id")
    .single();
  if (cErr) return { error: cErr.message };
  const { data: days } = await supabase.from("program_days").select("id, day_no, name").eq("program_id", programId).order("day_no");
  for (const d of days || []) {
    const { data: nd } = await supabase.from("program_days").insert({ program_id: copy.id, day_no: d.day_no, name: d.name }).select("id").single();
    if (!nd) continue;
    const { data: exs } = await supabase.from("program_exercises").select("exercise_id, sets, reps, rest_sec").eq("program_day_id", d.id);
    if ((exs || []).length) {
      await supabase.from("program_exercises").insert(exs.map((e) => ({ program_day_id: nd.id, exercise_id: e.exercise_id, sets: e.sets, reps: e.reps, rest_sec: e.rest_sec })));
    }
  }

  // Make the assigned plan the client's active one so it shows immediately in "Mijn training".
  await supabase.from("programs").update({ is_active: false }).eq("member_id", memberId);
  await supabase.from("programs").update({ is_active: true }).eq("id", copy.id);

  const { data: cl } = await supabase.from("profiles").select("full_name").eq("id", memberId).single();
  await logCoachActivity({ gymId: profile.gym_id, coachId: userId, type: "program", summary: `Programma toegewezen aan ${cl?.full_name || "client"}`, refId: copy.id });
  const { data: co } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
  await notify({ gymId: profile.gym_id, userId: memberId, actorId: userId, type: "coach_assigned", title: `${co?.full_name || "Je coach"} heeft je trainingsschema klaargezet 💪`, body: "Bekijk je programma bij Mijn training.", link: "/training" });

  revalidatePath(`/coach/programmas/${programId}`);
  return { ok: true, message: "Programma toegewezen ✓" };
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
  let image_url = null;
  try { image_url = await uploadEventImage(formData.get("image"), profile.gym_id); } catch (err) { return { error: err.message }; }
  const { error: e } = await supabase.from("events").insert({
    gym_id: profile.gym_id,
    title: formData.get("title"),
    description: formData.get("description") || null,
    image_url,
    faq: parseFaq(formData),
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    capacity: num(formData.get("capacity"), 12),
    price_cents: cents(formData.get("price_eur")),
    status: "pending", // needs admin approval before it goes live
    coach_id: userId,
    created_by: userId,
  });
  if (e) return { error: e.message };
  await logCoachActivity({ gymId: profile.gym_id, coachId: userId, type: "event", summary: `Event voorgesteld: ${formData.get("title")}` });
  try {
    const { data: c } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    await notifyAdmins({ gymId: profile.gym_id, actorId: userId, type: "event", title: `${c?.full_name || "Een coach"} stelt een event voor`, body: `${formData.get("title")} — keur goed in Events`, link: "/beheer/events" });
  } catch {}
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
