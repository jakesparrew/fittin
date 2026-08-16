"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nieuwShareToken, kopieVelden } from "@/lib/workout-share";

// De handelingen die van de oefeningenbibliotheek een lus maken: bewaren, in een schema zetten,
// los loggen, delen en overnemen. Owner-doel: elke oefeningpagina moet iets kunnen, in plaats van
// alleen door te linken naar de volgende oefening.

async function ikBen() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Log in om dit te bewaren." };
  const { data: profile } = await supabase.from("profiles").select("id, gym_id, full_name").eq("id", user.id).single();
  if (!profile) return { error: "Profiel niet gevonden." };
  return { supabase, user, profile };
}

// ---- Favorieten -----------------------------------------------------------------------------
export async function toggleFavorite(formData) {
  const { supabase, user, error } = await ikBen();
  if (error) return { error };
  const exerciseId = String(formData.get("exerciseId") || "");
  if (!exerciseId) return { error: "Geen oefening." };

  const { data: bestaat } = await supabase
    .from("exercise_favorites").select("exercise_id")
    .eq("user_id", user.id).eq("exercise_id", exerciseId).maybeSingle();

  if (bestaat) {
    const { error: e } = await supabase.from("exercise_favorites").delete().eq("user_id", user.id).eq("exercise_id", exerciseId);
    if (e) return { error: e.message };
    revalidatePath("/oefeningen");
    return { ok: true, favoriet: false, message: "Uit favorieten gehaald" };
  }
  const { error: e } = await supabase.from("exercise_favorites").insert({ user_id: user.id, exercise_id: exerciseId });
  if (e) return { error: e.message };
  revalidatePath("/oefeningen");
  return { ok: true, favoriet: true, message: "Bewaard bij je favorieten ✓" };
}

// ---- Oefening in een schema ------------------------------------------------------------------
// Wie nog geen schema heeft, krijgt er één. Anders is "＋ in mijn schema" een knop die eerst een
// handleiding vraagt — precies de drempel die we willen weghalen.
export async function addExerciseToPlan(formData) {
  const { supabase, user, profile, error } = await ikBen();
  if (error) return { error };
  const exerciseId = String(formData.get("exerciseId") || "");
  if (!exerciseId) return { error: "Geen oefening." };
  let dayId = String(formData.get("dayId") || "");

  if (!dayId) {
    // Geen dag gekozen → val terug op het actieve schema, of maak er één.
    let { data: plan } = await supabase
      .from("programs").select("id").eq("member_id", user.id).eq("is_active", true).maybeSingle();
    if (!plan) {
      const { data: laatste } = await supabase
        .from("programs").select("id").eq("member_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      plan = laatste;
    }
    if (!plan) {
      const { data: nieuw, error: pe } = await supabase
        .from("programs").insert({ gym_id: profile.gym_id, member_id: user.id, name: "Mijn workout", is_active: true }).select("id").single();
      if (pe) return { error: pe.message };
      plan = nieuw;
    }
    const { data: dag } = await supabase
      .from("program_days").select("id").eq("program_id", plan.id).order("day_no").limit(1).maybeSingle();
    if (dag) dayId = dag.id;
    else {
      const { data: nieuweDag, error: de } = await supabase
        .from("program_days").insert({ program_id: plan.id, day_no: 1, name: "Dag 1" }).select("id").single();
      if (de) return { error: de.message };
      dayId = nieuweDag.id;
    }
  }

  // Achteraan toevoegen: de volgorde die het lid zelf opbouwde blijft intact.
  const { data: laatstePos } = await supabase
    .from("program_exercises").select("position").eq("program_day_id", dayId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error: ie } = await supabase.from("program_exercises").insert({
    program_day_id: dayId, exercise_id: exerciseId,
    sets: 3, reps: 10, rest_sec: 90, position: (laatstePos?.position ?? 0) + 1,
  });
  if (ie) return { error: ie.message };
  revalidatePath("/plannen");
  return { ok: true, message: "Toegevoegd aan je schema ✓" };
}

// ---- Losse oefening loggen -------------------------------------------------------------------
// Zonder dit kan alleen wie een schema volgt zijn reps bijhouden, terwijl /training juist van die
// logs leeft. Een losse log hangt aan een verborgen "Losse oefeningen"-schema, zodat hij in
// dezelfde tabel belandt en gewoon meetelt in volume, PR's en streak.
export async function logLooseSets(formData) {
  const { supabase, user, profile, error } = await ikBen();
  if (error) return { error };
  const exerciseId = String(formData.get("exerciseId") || "");
  let sets;
  try { sets = JSON.parse(String(formData.get("sets") || "[]")); } catch { return { error: "Ongeldige sets." }; }
  sets = (Array.isArray(sets) ? sets : [])
    .map((s) => ({ reps: Number(s.reps) || 0, weight_kg: s.weight_kg === "" || s.weight_kg == null ? null : Number(s.weight_kg) }))
    .filter((s) => s.reps > 0);
  if (!exerciseId || !sets.length) return { error: "Vul minstens één set met reps in." };

  const admin = createAdminClient();
  const LOS = "Losse oefeningen";
  let { data: losPlan } = await admin
    .from("programs").select("id").eq("member_id", user.id).eq("name", LOS).maybeSingle();
  if (!losPlan) {
    const { data: p, error: pe } = await admin
      .from("programs").insert({ gym_id: profile.gym_id, member_id: user.id, name: LOS, is_active: false }).select("id").single();
    if (pe) return { error: pe.message };
    losPlan = p;
    await admin.from("program_days").insert({ program_id: p.id, day_no: 1, name: "Los" });
  }
  const { data: dag } = await admin.from("program_days").select("id").eq("program_id", losPlan.id).order("day_no").limit(1).single();

  // Eén regel per oefening hergebruiken: anders groeit dit schema met elke sessie aan.
  let { data: pe } = await admin
    .from("program_exercises").select("id").eq("program_day_id", dag.id).eq("exercise_id", exerciseId).maybeSingle();
  if (!pe) {
    const { data: nieuw, error: ne } = await admin
      .from("program_exercises").insert({ program_day_id: dag.id, exercise_id: exerciseId, sets: sets.length, reps: sets[0].reps, position: 1 }).select("id").single();
    if (ne) return { error: ne.message };
    pe = nieuw;
  }

  const vandaag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  // Zelfde dag opnieuw loggen = vervangen, niet stapelen. Anders verdubbelt je volume wanneer je
  // per ongeluk twee keer op "log" duwt.
  await admin.from("workout_logs").delete().eq("user_id", user.id).eq("program_exercise_id", pe.id).eq("logged_on", vandaag);
  const { error: le } = await admin.from("workout_logs").insert({
    gym_id: profile.gym_id, user_id: user.id, program_exercise_id: pe.id, logged_on: vandaag, sets_json: sets,
  });
  if (le) return { error: le.message };
  revalidatePath("/training");
  const volume = sets.reduce((a, s) => a + s.reps * (s.weight_kg || 0), 0);
  return { ok: true, message: `${sets.length} ${sets.length === 1 ? "set" : "sets"} gelogd${volume ? ` · ${Math.round(volume)} kg volume` : ""} ✓` };
}

// ---- Delen + overnemen ------------------------------------------------------------------------
export async function toggleShareLink(formData) {
  const { supabase, user, error } = await ikBen();
  if (error) return { error };
  const programId = String(formData.get("programId") || "");
  const uit = String(formData.get("uit") || "") === "1";
  const { data: plan } = await supabase.from("programs").select("id, member_id, share_token").eq("id", programId).maybeSingle();
  if (!plan || plan.member_id !== user.id) return { error: "Dit is jouw schema niet." };

  if (uit) {
    const { error: e } = await supabase.from("programs").update({ share_token: null }).eq("id", programId);
    if (e) return { error: e.message };
    revalidatePath("/plannen");
    return { ok: true, message: "Deellink ingetrokken — de oude link werkt niet meer ✓" };
  }
  const token = plan.share_token || nieuwShareToken();
  const { error: e } = await supabase.from("programs").update({ share_token: token }).eq("id", programId);
  if (e) return { error: e.message };
  revalidatePath("/plannen");
  return { ok: true, token, message: "Deellink klaar ✓" };
}

// Neem een gedeeld of publiek schema over als eigen, bewerkbare kopie.
export async function adoptProgram(formData) {
  const { supabase, user, profile, error } = await ikBen();
  if (error) return { error };
  const token = String(formData.get("token") || "");
  const bronId = String(formData.get("programId") || "");
  const admin = createAdminClient();

  const q = admin.from("programs").select("id, name, subtitle, description, level, est_minutes, focus, member_id, is_public, share_token");
  const { data: bron } = token ? await q.eq("share_token", token).maybeSingle() : await q.eq("id", bronId).maybeSingle();
  if (!bron) return { error: "Dit schema bestaat niet (meer)." };
  // Enkel wat écht gedeeld is mag overgenomen worden — een id raden is geen toegang.
  if (!token && !bron.is_public) return { error: "Dit schema is niet gedeeld." };
  if (bron.member_id === user.id) return { error: "Dit is al jouw schema." };

  const { data: kopie, error: ke } = await supabase
    .from("programs").insert(kopieVelden(bron, user.id, profile.gym_id)).select("id").single();
  if (ke) return { error: ke.message };

  const { data: dagen } = await admin.from("program_days").select("id, day_no, name").eq("program_id", bron.id).order("day_no");
  for (const d of dagen || []) {
    const { data: nieuweDag } = await supabase
      .from("program_days").insert({ program_id: kopie.id, day_no: d.day_no, name: d.name }).select("id").single();
    if (!nieuweDag) continue;
    const { data: oef } = await admin
      .from("program_exercises")
      .select("exercise_id, sets, reps, rest_sec, position, section, rep_text, tempo, notes, rpe, superset_group, superset_order")
      .eq("program_day_id", d.id).order("position");
    if (oef?.length) {
      // target_weight_kg bewust niet mee: dat is het gewicht van de deler, niet van de overnemer.
      await supabase.from("program_exercises").insert(oef.map((o) => ({ ...o, program_day_id: nieuweDag.id })));
    }
  }
  revalidatePath("/plannen");
  return { ok: true, programId: kopie.id, message: "Schema overgenomen — pas het gerust aan ✓" };
}

// ---- Zichtbaarheid voor buddies ----------------------------------------------------------------
export async function setTrainingVisibility(formData) {
  const { supabase, user, error } = await ikBen();
  if (error) return { error };
  const aan = String(formData.get("aan") || "") === "1";
  const { error: e } = await supabase.from("profiles").update({ training_visible_to_buddies: aan }).eq("id", user.id);
  if (e) return { error: e.message };
  revalidatePath("/account");
  return { ok: true, message: aan ? "Je buddies zien nu dat je meetraint ✓" : "Je traint weer onzichtbaar ✓" };
}
