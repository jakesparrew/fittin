"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Ensure the caller is staff (coach|beheerder); returns the supabase client + profile.
async function requireStaff(beheerderOnly = false) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, gym_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || !["coach", "beheerder"].includes(profile.role))
    return { error: "Geen rechten." };
  if (beheerderOnly && profile.role !== "beheerder")
    return { error: "Alleen beheerder." };
  return { supabase, profile };
}

const num = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

// ---- Gym schedule / settings ----
export async function updateGymSettings(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const patch = {
    name: formData.get("name") || undefined,
    address: formData.get("address") || undefined,
    slot_minutes: num(formData.get("slot_minutes"), 60),
    // Gym is open 24/7; daluur disabled for now.
    open_hour: 0,
    close_hour: 24,
    daluur_until_hour: 0,
  };
  const { error: e } = await supabase.from("gyms").update(patch).eq("id", profile.gym_id);
  if (e) return { error: e.message };
  revalidatePath("/beheer/instellingen");
  revalidatePath("/boeken");
  return { ok: true };
}

// ---- Services / pricing ----
export async function upsertService(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const row = {
    gym_id: profile.gym_id,
    type: formData.get("type") || "fit60",
    key: formData.get("key"),
    name: formData.get("name"),
    duration_min: num(formData.get("duration_min"), 60),
    price_cents: Math.round(parseFloat(String(formData.get("price_eur") || "0").replace(",", ".")) * 100),
    capacity: num(formData.get("capacity"), 1),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  };
  const q = id
    ? supabase.from("services").update(row).eq("id", id)
    : supabase.from("services").insert(row);
  const { error: e } = await q;
  if (e) return { error: e.message };
  revalidatePath("/beheer/diensten");
  revalidatePath("/boeken");
  return { ok: true };
}

export async function toggleService(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const active = formData.get("active") === "true";
  await supabase.from("services").update({ active: !active }).eq("id", id);
  revalidatePath("/beheer/diensten");
  revalidatePath("/boeken");
}

// ---- Bookings ----
export async function adminCancelBooking(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  const id = formData.get("bookingId");
  await supabase
    .from("bookings")
    .update({ status: "geannuleerd", cancelled_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/beheer/boekingen");
  revalidatePath("/boeken");
}

export async function adminCreateBooking(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  const { error: e } = await supabase.rpc("admin_create_booking", {
    p_member: formData.get("memberId"),
    p_service: formData.get("serviceId"),
    p_date: formData.get("date"),
    p_hour: num(formData.get("hour")),
    p_persons: num(formData.get("persons"), 1),
  });
  if (e) return { error: e.message };
  revalidatePath("/beheer/boekingen");
  revalidatePath("/boeken");
  return { ok: true };
}

export async function adminBlockSlot(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  const { error: e } = await supabase.rpc("admin_block_slot", {
    p_date: formData.get("date"),
    p_hour: num(formData.get("hour")),
    p_reason: formData.get("reason") || null,
  });
  if (e) return { error: e.message };
  revalidatePath("/beheer/boekingen");
  revalidatePath("/boeken");
  return { ok: true };
}

export async function adminUnblock(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("slot_blocks").delete().eq("id", formData.get("blockId"));
  revalidatePath("/beheer/boekingen");
  revalidatePath("/boeken");
}

// ---- Members ----
export async function adminAdjustCredits(formData) {
  const { supabase, error } = await requireStaff();
  if (error) return { error };
  const { error: e } = await supabase.rpc("admin_adjust_credits", {
    p_member: formData.get("memberId"),
    p_delta: num(formData.get("delta")),
    p_reason: formData.get("reason") || "correctie",
  });
  if (e) return { error: e.message };
  revalidatePath("/beheer/leden");
  return { ok: true };
}

// ---- Coach billing config ----
export async function setCoachBilling(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  await supabase
    .from("profiles")
    .update({
      coach_billing_mode: formData.get("mode") || "invoice",
      coach_session_price_cents: Math.round(parseFloat(String(formData.get("price_eur") || "0").replace(",", ".")) * 100),
    })
    .eq("id", formData.get("coachId"))
    .eq("gym_id", profile.gym_id);
  revalidatePath("/beheer/coaches");
  revalidatePath("/coach");
  return { ok: true };
}

export async function grantCoachCredits(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  await supabase.from("coach_ledger").insert({
    gym_id: profile.gym_id,
    coach_id: formData.get("coachId"),
    delta: num(formData.get("delta")),
    reason: "grant",
  });
  revalidatePath("/beheer/coaches");
  revalidatePath("/coach");
  return { ok: true };
}

// ---- Coach ↔ client assignments ----
export async function addCoach(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const { error: e } = await supabase.rpc("admin_set_role", {
    p_member: formData.get("memberId"),
    p_role: "coach",
  });
  if (e) return { error: e.message };
  revalidatePath("/beheer/coaches");
  revalidatePath("/beheer/leden");
  return { ok: true };
}

export async function assignCoachClient(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const coachId = formData.get("coachId");
  const clientId = formData.get("clientId");
  if (!coachId || !clientId) return { error: "Coach en lid vereist." };
  if (coachId === clientId) return { error: "Een coach kan zichzelf niet coachen." };
  const { error: e } = await supabase
    .from("coach_clients")
    .upsert({ gym_id: profile.gym_id, coach_id: coachId, client_id: clientId }, { onConflict: "gym_id,coach_id,client_id" });
  if (e) return { error: e.message };
  revalidatePath("/beheer/coaches");
  revalidatePath(`/beheer/leden/${clientId}`);
  return { ok: true };
}

export async function unassignCoachClient(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const q = supabase.from("coach_clients").delete().eq("gym_id", profile.gym_id);
  const id = formData.get("id");
  if (id) q.eq("id", id);
  else q.eq("coach_id", formData.get("coachId")).eq("client_id", formData.get("clientId"));
  await q;
  revalidatePath("/beheer/coaches");
  if (formData.get("clientId")) revalidatePath(`/beheer/leden/${formData.get("clientId")}`);
  return { ok: true };
}

// ---- Packages (bundles / subscriptions) ----
export async function upsertPackage(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const row = {
    gym_id: profile.gym_id,
    kind: formData.get("kind") || "beurtenkaart",
    name: formData.get("name"),
    price_cents: Math.round(parseFloat(String(formData.get("price_eur") || "0").replace(",", ".")) * 100),
    credits: num(formData.get("credits"), 0),
    period: formData.get("period") || "once",
    sort: num(formData.get("sort"), 0),
  };
  const q = id ? supabase.from("packages").update(row).eq("id", id) : supabase.from("packages").insert({ ...row, active: true });
  const { error: e } = await q;
  if (e) return { error: e.message };
  revalidatePath("/beheer/pakketten");
  revalidatePath("/lidmaatschap");
  return { ok: true };
}

export async function togglePackage(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  await supabase.from("packages").update({ active: formData.get("active") !== "true" }).eq("id", formData.get("id"));
  revalidatePath("/beheer/pakketten");
  revalidatePath("/lidmaatschap");
}

export async function adminSetRole(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const { error: e } = await supabase.rpc("admin_set_role", {
    p_member: formData.get("memberId"),
    p_role: formData.get("role"),
  });
  if (e) return { error: e.message };
  revalidatePath("/beheer/leden");
  return { ok: true };
}
