"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slotInstant } from "@/lib/time";
import { logCoachActivity } from "@/lib/coachlog";
import { notify, notifyAdmins } from "@/lib/notify";
import { uploadEventImage, parseFaq } from "@/lib/eventmedia";
import { exerciseRowFromForm } from "@/lib/exercise-fields";
import { viewAsActive } from "@/lib/coach";

const num = (v, d = null) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const flt = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const cents = (v) => Math.round(parseFloat(String(v || "0").replace(",", ".")) * 100) || 0;

// Rich per-exercise prescription fields (W2) shared by add + update. tempo/notes already existed.
function peRichFields(formData) {
  return {
    notes: (formData.get("notes") || "").toString().trim() || null,
    tempo: (formData.get("tempo") || "").toString().trim() || null,
    target_weight_kg: flt(formData.get("target_weight_kg")),
    rpe: (() => { const r = num(formData.get("rpe")); return r != null ? Math.max(1, Math.min(10, r)) : null; })(),
    superset_group: num(formData.get("superset_group")),
  };
}

// Coach-only guard (coaches manage their OWN exercises + program templates from /coach,
// never the admin /beheer area).
async function requireCoach() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase.from("profiles").select("id, gym_id, role").eq("id", user.id).single();
  if (!profile || !["coach", "beheerder"].includes(profile.role)) return { error: "Geen rechten." };
  if (await viewAsActive()) return { error: "Alleen-lezen tijdens ‘bekijk als coach’. Ga terug naar beheerder om te wijzigen." };
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
// Starter presets scaffold the DAY structure (a coach fills in exercises after) — beats a blank page.
const PROGRAM_PRESETS = {
  full_body_3: ["Dag 1", "Dag 2", "Dag 3"],
  upper_lower_4: ["Upper A", "Lower A", "Upper B", "Lower B"],
  ppl_3: ["Push", "Pull", "Benen"],
};
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
  const dayNames = PROGRAM_PRESETS[formData.get("preset")] || ["Dag 1"];
  await supabase.from("program_days").insert(dayNames.map((name, i) => ({ program_id: data.id, day_no: i + 1, name })));
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
  // Achteraan de dag zetten. Zonder dit bleef `position` op de default 0 staan voor élke rij die
  // een coach toevoegt, terwijl /training wél op position sorteert (training/page.jsx:65). Sorteren
  // op een kolom die overal 0 is, is geen sorteren: de databank geeft dan de heap-volgorde terug en
  // die verschuift na elke wijziging. Gevolg: de coach zet de squat vooraan en het lid opent zijn
  // schema met bicep curls.
  const { data: laatste } = await supabase
    .from("program_exercises").select("position").eq("program_day_id", dayId)
    .order("position", { ascending: false }).limit(1).maybeSingle();
  await supabase.from("program_exercises").insert({
    program_day_id: dayId,
    exercise_id: formData.get("exerciseId"),
    position: (laatste?.position ?? 0) + 1,
    sets: num(formData.get("sets")),
    reps: num(formData.get("reps")),
    rest_sec: num(formData.get("rest_sec")),
    ...peRichFields(formData),
  });
  revalidatePath(`/coach/programmas/${programId}`);
}

// Edit an existing program-exercise (sets/reps/rest + rich prescription fields). Ownership-checked.
export async function coachUpdateProgramExercise(formData) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  const programId = formData.get("programId");
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  const peId = formData.get("id");
  // Confirm the row hangs off a day of THIS owned program before updating.
  const { data: pe } = await supabase.from("program_exercises").select("program_day_id").eq("id", peId).maybeSingle();
  if (!pe) return { error: "Niet gevonden." };
  const { data: pd } = await supabase.from("program_days").select("id").eq("id", pe.program_day_id).eq("program_id", programId).maybeSingle();
  if (!pd) return { error: "Geen toegang." };
  await supabase.from("program_exercises").update({
    sets: num(formData.get("sets")),
    reps: num(formData.get("reps")),
    rest_sec: num(formData.get("rest_sec")),
    ...peRichFields(formData),
  }).eq("id", peId);
  revalidatePath(`/coach/programmas/${programId}`);
  return { ok: true, message: "Bijgewerkt ✓" };
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
  const { data: link } = await supabase.from("coach_clients").select("id").eq("coach_id", userId).eq("client_id", memberId).eq("status", "accepted").maybeSingle();
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
    // Alle voorschriftkolommen mee, niet enkel sets/reps/rust. Hiervoor stond hier
    // .select("exercise_id, sets, reps, rest_sec") — dus notitie, tempo, streefgewicht, RPE,
    // superset én volgorde verdwenen precies op de tap "Toewijzen", terwijl de coach ze op zijn
    // sjabloon nog zag staan. Gemeten op 30-08-2026: van de 86 oefeningen in sjablonen droegen er
    // 55 een voorschrift; van de 68 in toegewezen programma's nul. Een wildvreemd lid dat een
    // publiek schema overnam (adoptProgram, loop-actions.js:190) kreeg een getrouwere kopie dan
    // de betalende client van de coach.
    const { data: exs } = await supabase
      .from("program_exercises")
      .select("exercise_id, sets, reps, rest_sec, position, section, rep_text, tempo, notes, rpe, target_weight_kg, superset_group, superset_order")
      .eq("program_day_id", d.id)
      .order("position")
      .order("id");
    if ((exs || []).length) {
      // De hele rij overnemen, alleen de dag wisselt. target_weight_kg gaat hier WEL mee — anders
      // dan bij adoptProgram: daar neemt een vreemde het gewicht van een ander over, hier schrijft
      // de coach het streefgewicht bewust voor aan déze client.
      await supabase.from("program_exercises").insert(exs.map((e) => ({ ...e, program_day_id: nd.id })));
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

// ---- Public Workouts (publish a template so EVERYONE can browse + follow it at /workouts) ----
const slugify = (s) =>
  String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "workout";

export async function setWorkoutPublic(formData) {
  const { supabase, profile, userId, error } = await requireCoach();
  if (error) return { error };
  const programId = formData.get("programId");
  const publish = formData.get("publish") === "true";
  const { data: prog } = await supabase.from("programs").select("id, gym_id, coach_id, member_id, name, slug").eq("id", programId).maybeSingle();
  if (!prog || prog.gym_id !== profile.gym_id) return { error: "Programma niet gevonden." };
  // Coaches may only publish their OWN programs; a beheerder may manage any gym program (incl. seeded).
  if (profile.role !== "beheerder" && prog.coach_id !== userId) return { error: "Je kan enkel je eigen programma's publiceren." };

  if (!publish) {
    const { error: e } = await supabase.from("programs").update({ is_public: false }).eq("id", programId);
    if (e) return { error: e.message };
    revalidateTag("workouts");
    revalidatePath("/workouts");
    revalidatePath(`/coach/programmas/${programId}`);
    revalidatePath(`/beheer/programmas/${programId}`);
    return { ok: true, message: "Workout offline gehaald." };
  }

  if (prog.member_id) return { error: "Alleen sjablonen (niet toegewezen aan een lid) kunnen publiek worden." };
  let slug = slugify(formData.get("slug") || prog.slug || prog.name);
  const { data: clash } = await supabase.from("programs").select("slug").eq("gym_id", profile.gym_id).neq("id", programId).like("slug", `${slug}%`);
  const taken = new Set((clash || []).map((r) => r.slug));
  if (taken.has(slug)) { let i = 2; while (taken.has(`${slug}-${i}`)) i++; slug = `${slug}-${i}`; }

  const patch = {
    is_public: true, is_template: true, slug,
    subtitle: (formData.get("subtitle") || "").trim() || null,
    level: formData.get("level") || null,
    est_minutes: num(formData.get("est_minutes")),
    focus: (formData.get("focus") || "").trim() || null,
    category: formData.get("category") || null,
    description: (formData.get("description") || "").trim() || null,
  };
  const { error: e } = await supabase.from("programs").update(patch).eq("id", programId);
  if (e) return { error: e.message };
  revalidateTag("workouts");
  revalidatePath("/workouts");
  revalidatePath(`/workouts/${slug}`);
  revalidatePath(`/coach/programmas/${programId}`);
  revalidatePath(`/beheer/programmas/${programId}`);
  return { ok: true, message: "Gepubliceerd als publieke workout ✓", slug };
}

// ───────────────────────── De nieuwe programmabouwer (mobiel-eerst) ─────────────────────────
//
// De oude bouwer stuurde ~900 oefeningen als prop naar een dropdown, deed één serverrit per
// bewerking en had geen enkele manier om te herordenen. Deze acties dragen de nieuwe opzet:
// zoeken gebeurt op de server (niets meer meesturen), en een dag wordt in ÉÉN rit opgeslagen
// in plaats van in zes tot negen losse.

// Serverzoek voor het oefeningblad. Bewust met een limiet: de bouwer toont een blad, geen
// bibliotheek. De velden zijn wat ExerciseMedia en het detailvenster nodig hebben.
export async function coachZoekOefeningen(q) {
  const { supabase, profile, error } = await requireCoach();
  if (error) return { rows: [] };
  const zoek = String(q || "").trim().slice(0, 60);
  let query = supabase
    .from("exercises")
    .select("id, name, category, equipment, difficulty, muscle, primary_muscles, secondary_muscles, instructions, tips, image_url, animation_url, video_url, frames")
    .eq("gym_id", profile.gym_id)
    .order("name")
    .limit(40);
  if (zoek) query = query.ilike("name", `%${zoek}%`);
  const { data } = await query;
  return { rows: data || [] };
}

// Eén dag in één keer opslaan: naam, alle rijen (bestaand én nieuw, met hun volgorde) en wat
// verwijderd is. Vervangt de zes-formulieren-per-dag-dans van de oude bouwer.
export async function coachBewaarDag({ programId, dayId, naam, rijen, verwijderd }) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  const { data: day } = await supabase.from("program_days").select("id").eq("id", dayId).eq("program_id", programId).maybeSingle();
  if (!day) return { error: "Ongeldige dag." };

  // Alles wat van de client komt, hier opnieuw begrenzen — de payload is maar een voorstel.
  const schoon = (r, i) => ({
    exercise_id: r.exercise_id,
    position: i + 1,
    sets: num(r.sets),
    // Cijfers gaan in reps, al de rest ("8-12", "30 sec", "AMRAP") in rep_text — de kolom die
    // sinds 0071 bestaat, door WorkoutFollow al getoond wordt, maar nooit invulbaar was.
    reps: num(r.reps),
    rep_text: (r.rep_text || "").toString().trim().slice(0, 40) || null,
    rest_sec: num(r.rest_sec),
    notes: (r.notes || "").toString().trim().slice(0, 300) || null,
    tempo: (r.tempo || "").toString().trim().slice(0, 20) || null,
    target_weight_kg: flt(r.target_weight_kg),
    rpe: r.rpe != null && r.rpe !== "" ? Math.max(1, Math.min(10, num(r.rpe, 1))) : null,
    superset_group: num(r.superset_group),
    section: (r.section || "").toString().trim().slice(0, 40) || null,
  });

  if (String(naam || "").trim()) {
    await supabase.from("program_days").update({ name: String(naam).trim().slice(0, 80) }).eq("id", dayId);
  }

  // Verwijderen eerst, dan bijwerken/toevoegen — zo kan een verwijderde en heraangemaakte
  // oefening niet op een unieke botsing lopen. Alles blijft begrensd op déze dag.
  const weg = (verwijderd || []).filter(Boolean).slice(0, 100);
  if (weg.length) {
    const { error: delErr } = await supabase.from("program_exercises").delete().in("id", weg).eq("program_day_id", dayId);
    // 23503: er hangen workout_logs aan (de kolom heeft geen on delete). Niet stil slikken — de
    // oude bouwer meldde hier "Verwijderd ✓" terwijl er niets gebeurde.
    if (delErr) return { error: delErr.code === "23503" ? "Deze oefening heeft al gelogde trainingen van je client en kan niet weg. Pas ze aan in plaats van ze te verwijderen." : delErr.message };
  }

  for (const [i, r] of (rijen || []).slice(0, 60).entries()) {
    if (!r.exercise_id) continue;
    const rij = schoon(r, i);
    if (r.id) {
      const { error: e } = await supabase.from("program_exercises").update(rij).eq("id", r.id).eq("program_day_id", dayId);
      if (e) return { error: e.message };
    } else {
      const { error: e } = await supabase.from("program_exercises").insert({ ...rij, program_day_id: dayId });
      if (e) return { error: e.message };
    }
  }

  revalidatePath(`/coach/programmas/${programId}`);
  return { ok: true };
}

// Nieuwe dag zonder formulier — de bouwer roept dit aan en ververst daarna zelf.
export async function coachNieuweDag(programId) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  const { data: laatste } = await supabase.from("program_days").select("day_no").eq("program_id", programId).order("day_no", { ascending: false }).limit(1).maybeSingle();
  const dagNr = (laatste?.day_no || 0) + 1;
  const { data, error: e } = await supabase.from("program_days").insert({ program_id: programId, day_no: dagNr, name: `Dag ${dagNr}` }).select("id").single();
  if (e) return { error: e.message };
  revalidatePath(`/coach/programmas/${programId}`);
  return { ok: true, dayId: data.id };
}

export async function coachVerwijderDagNieuw(programId, dayId) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  const { error: e } = await supabase.from("program_days").delete().eq("id", dayId).eq("program_id", programId);
  if (e) return { error: e.code === "23503" ? "Deze dag heeft oefeningen met gelogde trainingen en kan niet weg." : e.message };
  revalidatePath(`/coach/programmas/${programId}`);
  return { ok: true };
}

// Dag dupliceren mét alle rijen — "week 2 is week 1 met iets meer gewicht" is het echte werk
// van een coach, en tot nu betekende dat alles opnieuw intikken.
export async function coachDupliceerDag(programId, dayId) {
  const { supabase, userId, error } = await requireCoach();
  if (error) return { error };
  if (!(await ownProgram(supabase, programId, userId))) return { error: "Geen eigen programma." };
  const { data: bron } = await supabase.from("program_days").select("id, name, program_id").eq("id", dayId).eq("program_id", programId).maybeSingle();
  if (!bron) return { error: "Ongeldige dag." };
  const { data: laatste } = await supabase.from("program_days").select("day_no").eq("program_id", programId).order("day_no", { ascending: false }).limit(1).maybeSingle();
  const { data: nieuw, error: e1 } = await supabase.from("program_days")
    .insert({ program_id: programId, day_no: (laatste?.day_no || 0) + 1, name: `${bron.name || "Dag"} (kopie)`.slice(0, 80) })
    .select("id").single();
  if (e1) return { error: e1.message };
  const { data: exs } = await supabase.from("program_exercises")
    .select("exercise_id, sets, reps, rest_sec, position, section, rep_text, tempo, notes, rpe, target_weight_kg, superset_group, superset_order")
    .eq("program_day_id", dayId).order("position").order("id");
  if (exs?.length) {
    const { error: e2 } = await supabase.from("program_exercises").insert(exs.map((x) => ({ ...x, program_day_id: nieuw.id })));
    if (e2) return { error: e2.message };
  }
  revalidatePath(`/coach/programmas/${programId}`);
  return { ok: true };
}
