"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCoachAssigned, sendRoleChanged, sendWelcomeNewAccount, sendCreditsAdjusted } from "@/lib/email";
import { enrollUserInDrips } from "@/lib/newsletter";
import { notify } from "@/lib/notify";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";

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
  // Bookable window. Last session starts at close_hour-1 (e.g. 6–23 → last start 22:00).
  const openH = Math.min(23, Math.max(0, num(formData.get("open_hour"), 6)));
  const closeH = Math.min(24, Math.max(openH + 1, num(formData.get("close_hour"), 23)));
  const patch = {
    name: formData.get("name") || undefined,
    address: formData.get("address") || undefined,
    slot_minutes: num(formData.get("slot_minutes"), 60),
    access_code: (formData.get("access_code") || "").trim() || null,
    access_info: (formData.get("access_info") || "").trim() || null,
    open_hour: openH,
    close_hour: closeH,
    daluur_until_hour: 0, // daluur disabled for now
  };
  const { error: e } = await supabase.from("gyms").update(patch).eq("id", profile.gym_id);
  if (e) return { error: e.message };
  revalidateTag("gym");
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
  revalidateTag("services");
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
  revalidateTag("services");
  revalidatePath("/beheer/diensten");
  revalidatePath("/boeken");
}

// ---- Bookings ----
export async function adminCancelBooking(formData) {
  const { supabase, error } = await requireStaff(true);
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
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const memberId = formData.get("memberId");
  const { data: bookingId, error: e } = await supabase.rpc("admin_create_booking", {
    p_member: memberId,
    p_service: formData.get("serviceId"),
    p_date: formData.get("date"),
    p_hour: num(formData.get("hour")),
    p_persons: num(formData.get("persons"), 1),
    p_use_credit: formData.get("useCredit") === "on",
  });
  if (e) return { error: e.message };
  // Confirm the booking to the member by email.
  try {
    const admin = createAdminClient();
    const [{ data: bk }, { data: m }] = await Promise.all([
      admin.from("bookings").select("gym_id, starts_at, ends_at, persons, services(name)").eq("id", bookingId).single(),
      admin.from("profiles").select("email, full_name").eq("id", memberId).single(),
    ]);
    if (bk && m?.email) {
      const { sendBookingConfirmation } = await import("@/lib/email");
      await sendBookingConfirmation({ to: m.email, name: m.full_name, serviceName: bk.services?.name || "Sessie", startsAt: bk.starts_at, endsAt: bk.ends_at, persons: bk.persons, free: true });
    }
    if (bk) await notify({ gymId: bk.gym_id, userId: memberId, type: "coach_booked", title: "Er is een sessie voor je geboekt", body: bk.services?.name || "Sessie", link: "/account" });
  } catch {}
  revalidatePath("/beheer/boekingen");
  revalidatePath("/boeken");
  return { ok: true };
}

// Block a consecutive range of hours at once (e.g. close the gym 9:00–17:00 for maintenance).
export async function adminBlockRange(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const date = formData.get("date");
  const from = num(formData.get("from_hour"));
  const to = num(formData.get("to_hour"));
  const reason = formData.get("reason") || null;
  if (!date || from == null || to == null || to <= from) return { error: "Kies een geldige periode (tot > van)." };
  let blocked = 0;
  for (let h = from; h < to; h++) {
    const { error: e } = await supabase.rpc("admin_block_slot", { p_date: date, p_hour: h, p_reason: reason });
    if (!e) blocked++;
  }
  revalidatePath("/beheer/boekingen");
  revalidatePath("/boeken");
  return { ok: true, message: `${blocked} uur geblokkeerd ✓` };
}

export async function adminBlockSlot(formData) {
  const { supabase, error } = await requireStaff(true);
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
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  await supabase.from("slot_blocks").delete().eq("id", formData.get("blockId"));
  revalidatePath("/beheer/boekingen");
  revalidatePath("/boeken");
}

// ---- Members ----
// Admin edits a member's basic profile (name, phone) — service role (bypasses the self-only RLS).
export async function adminUpdateMember(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const memberId = formData.get("memberId");
  if (!memberId) return { error: "Geen lid." };
  const admin = createAdminClient();
  const { error: e } = await admin
    .from("profiles")
    .update({ full_name: formData.get("full_name") || null, phone: formData.get("phone") || null })
    .eq("id", memberId).eq("gym_id", profile.gym_id);
  if (e) return { error: e.message };
  revalidatePath("/beheer/leden");
  revalidatePath(`/beheer/leden/${memberId}`);
  return { ok: true, message: "Profiel bijgewerkt ✓" };
}

// Re-send the account setup / login link to a member (e.g. they never finished onboarding).
export async function resendInviteMail(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const memberId = formData.get("memberId");
  const admin = createAdminClient();
  const { data: m } = await admin.from("profiles").select("email, full_name").eq("id", memberId).eq("gym_id", profile.gym_id).maybeSingle();
  if (!m?.email) return { error: "Geen e-mailadres." };
  try {
    const { data: link } = await admin.auth.admin.generateLink({ type: "recovery", email: m.email, options: { redirectTo: `${siteUrl()}/wachtwoord-herstellen` } });
    const action = link?.properties?.action_link;
    if (action) await sendWelcomeNewAccount({ to: m.email, name: m.full_name, link: action });
  } catch (e) {
    return { error: e?.message || "Versturen mislukt." };
  }
  return { ok: true, message: `Uitnodiging verstuurd naar ${m.email} ✓` };
}

export async function adminAdjustCredits(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const memberId = formData.get("memberId");
  const delta = num(formData.get("delta"));
  const reason = formData.get("reason") || "correctie";
  if (!delta) return { error: "Geef een aantal (+ erbij, − eraf)." };
  const { error: e } = await supabase.rpc("admin_adjust_credits", { p_member: memberId, p_delta: delta, p_reason: reason });
  if (e) return { error: e.message };
  // Notify the member of the change + reason.
  try {
    const admin = createAdminClient();
    const [{ data: m }, { data: ledger }] = await Promise.all([
      admin.from("profiles").select("email, full_name").eq("id", memberId).single(),
      admin.from("credits_ledger").select("delta").eq("user_id", memberId).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    ]);
    const balance = (ledger || []).reduce((a, r) => a + r.delta, 0);
    if (m?.email) await sendCreditsAdjusted({ to: m.email, name: m.full_name, delta, reason, balance });
    await notify({ gymId: profile.gym_id, userId: memberId, type: "credits", title: delta >= 0 ? `+${delta} sessie${Math.abs(delta) > 1 ? "s" : ""} bijgeschreven` : `${delta} sessie${Math.abs(delta) > 1 ? "s" : ""} aangepast`, body: reason, link: "/account" });
  } catch {}
  revalidatePath("/beheer/leden");
  revalidatePath(`/beheer/leden/${memberId}`);
  return { ok: true };
}

// ---- Coach billing config ----
export async function setCoachBilling(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  // Coach billing is fixed: always € 12/sessie via prepaid sessietegoed (no free/invoice, no abo).
  await supabase
    .from("profiles")
    .update({ coach_billing_mode: "credit", coach_session_price_cents: 1200 })
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

// ---- User management (add / remove / create admin) ----
// Create a new account (any role) and email a set-password link. Uses the service role.
export async function adminAddUser(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const full_name = String(formData.get("full_name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const role = formData.get("role") || "lid";
  if (!email || !email.includes("@")) return { error: "Geldig e-mailadres vereist." };

  const admin = createAdminClient();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID() + "Aa1!",
    user_metadata: { full_name },
  });
  if (cErr) {
    if (/already|exists|registered/i.test(cErr.message)) return { error: "Er bestaat al een account met dit e-mailadres." };
    return { error: cErr.message };
  }
  const uid = created.user.id;
  // The signup trigger creates the profile; patch role/phone/gym to the admin's gym.
  await admin.from("profiles").update({ gym_id: profile.gym_id, role, phone: phone || null, full_name: full_name || null }).eq("id", uid);

  try {
    const { data: link } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteUrl()}/wachtwoord-herstellen` },
    });
    const action = link?.properties?.action_link;
    if (action) await sendWelcomeNewAccount({ to: email, name: full_name, link: action });
    if (role !== "lid") await sendRoleChanged({ to: email, name: full_name, role });
  } catch {}

  await enrollUserInDrips(uid); // start any active welcome drip

  revalidatePath("/beheer/leden");
  revalidatePath("/beheer/coaches");
  return { ok: true };
}

// Permanently remove a user (cascades their data; payment history is kept). Guarded.
export async function deleteUser(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const userId = formData.get("userId");
  if (!userId) return { error: "Geen gebruiker." };
  if (userId === profile.id) return { error: "Je kan jezelf niet verwijderen." };

  const { data: target } = await supabase.from("profiles").select("role, gym_id").eq("id", userId).single();
  if (!target || target.gym_id !== profile.gym_id) return { error: "Onbekende gebruiker." };
  if (target.role === "beheerder") {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("gym_id", profile.gym_id).eq("role", "beheerder");
    if ((count ?? 0) <= 1) return { error: "Dit is de laatste beheerder — niet te verwijderen." };
  }

  const admin = createAdminClient();
  const { error: dErr } = await admin.auth.admin.deleteUser(userId);
  if (dErr) return { error: dErr.message };
  revalidatePath("/beheer/leden");
  redirect("/beheer/leden");
}

// ---- Coach ↔ client assignments ----
export async function addCoach(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const memberId = formData.get("memberId");
  const { error: e } = await supabase.rpc("admin_set_role", { p_member: memberId, p_role: "coach" });
  if (e) return { error: e.message };
  // Make new coaches visible on /coaches by default (their name is enough); they can opt out.
  await supabase.from("profiles").update({ coach_public: true }).eq("id", memberId);
  try {
    const { data: m } = await supabase.from("profiles").select("email, full_name").eq("id", memberId).single();
    if (m?.email) await sendRoleChanged({ to: m.email, name: m.full_name, role: "coach" });
  } catch {}
  revalidateTag("coaches");
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
  try {
    const [{ data: client }, { data: coach }] = await Promise.all([
      supabase.from("profiles").select("email, full_name").eq("id", clientId).single(),
      supabase.from("profiles").select("full_name").eq("id", coachId).single(),
    ]);
    if (client?.email) await sendCoachAssigned({ to: client.email, name: client.full_name, coachName: coach?.full_name || "een coach" });
    await notify({ gymId: profile.gym_id, userId: clientId, type: "coach_assigned", title: `${coach?.full_name || "Een coach"} is nu jouw coach`, body: "Bekijk je trainingsschema bij Mijn training.", link: "/training" });
    await notify({ gymId: profile.gym_id, userId: coachId, type: "coach_assigned", title: `${client?.full_name || "Een lid"} is aan jou toegewezen`, body: "Bekijk je client en stel een programma op.", link: "/coach/clienten" });
  } catch {}
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

// ---- Coach session requests ----
export async function resolveCoachRequest(formData) {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const decision = formData.get("decision"); // approved | declined
  const { data: req } = await supabase.from("coach_session_requests").select("*").eq("id", id).eq("gym_id", profile.gym_id).single();
  if (!req || req.status !== "pending") return { error: "Aanvraag niet gevonden." };
  await supabase.from("coach_session_requests").update({ status: decision, resolved_at: new Date().toISOString(), resolved_by: userId }).eq("id", id);
  if (decision === "approved") {
    await supabase.from("coach_ledger").insert({ gym_id: profile.gym_id, coach_id: req.coach_id, delta: req.qty, reason: "grant" });
    try {
      const { data: c } = await supabase.from("profiles").select("email, full_name").eq("id", req.coach_id).single();
      if (c?.email) { const { sendCoachSessionsGranted } = await import("@/lib/email"); await sendCoachSessionsGranted({ to: c.email, name: c.full_name, qty: req.qty }); }
    } catch {}
    await notify({ gymId: profile.gym_id, userId: req.coach_id, type: "request", title: `${req.qty} coach-sessies goedgekeurd ✓`, body: "Je tegoed is bijgeschreven.", link: "/coach" });
  } else {
    await notify({ gymId: profile.gym_id, userId: req.coach_id, type: "request", title: "Je sessie-aanvraag werd afgewezen", body: `${req.qty} sessies`, link: "/coach" });
  }
  revalidatePath("/beheer/coaches");
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
  const memberId = formData.get("memberId");
  const role = formData.get("role");
  const { error: e } = await supabase.rpc("admin_set_role", { p_member: memberId, p_role: role });
  if (e) return { error: e.message };
  try {
    const { data: m } = await supabase.from("profiles").select("email, full_name").eq("id", memberId).single();
    if (m?.email) await sendRoleChanged({ to: m.email, name: m.full_name, role });
  } catch {}
  revalidatePath("/beheer/leden");
  revalidatePath(`/beheer/leden/${memberId}`);
  return { ok: true };
}
