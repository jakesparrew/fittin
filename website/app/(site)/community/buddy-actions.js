"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBuddyRequest, sendBuddyInvite } from "@/lib/email";

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase.from("profiles").select("id, gym_id, full_name, referral_code").eq("id", user.id).single();
  return { supabase, user, profile };
}

// Invite by email: existing member → buddy request; otherwise → invite to join.
export async function inviteBuddy(formData) {
  const { supabase, user, profile, error } = await me();
  if (error) return { error };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email.includes("@")) return { error: "Vul een geldig e-mailadres in." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id, full_name, email").eq("gym_id", profile.gym_id).ilike("email", email).maybeSingle();

  if (target) {
    if (target.id === user.id) return { error: "Dat ben jezelf 🙂" };
    const { data: existing } = await admin.from("buddies").select("id, status")
      .eq("gym_id", profile.gym_id)
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`)
      .maybeSingle();
    if (existing) return { error: existing.status === "accepted" ? "Jullie zijn al buddies." : "Er loopt al een aanvraag." };
    const { error: insErr } = await supabase.from("buddies").insert({ gym_id: profile.gym_id, requester_id: user.id, addressee_id: target.id, status: "pending" });
    if (insErr) return { error: insErr.message };
    await sendBuddyRequest({ to: target.email, name: target.full_name, fromName: profile.full_name || "Een Fittin'-lid" });
    revalidatePath("/community");
    return { ok: true, message: `Buddy-aanvraag verstuurd naar ${target.full_name || email}.` };
  }

  // Not a member yet → invite to join with the referral code.
  await sendBuddyInvite({ to: email, fromName: profile.full_name || "Een Fittin'-lid", refCode: profile.referral_code });
  revalidatePath("/community");
  return { ok: true, message: `Uitnodiging verstuurd naar ${email}.` };
}

// Send a buddy request to a member picked from the search dropdown.
export async function requestBuddyById(memberId) {
  const { supabase, user, profile, error } = await me();
  if (error) return { error };
  if (!memberId || memberId === user.id) return { error: "Kies een ander lid." };
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id, full_name, email").eq("id", memberId).eq("gym_id", profile.gym_id).maybeSingle();
  if (!target) return { error: "Onbekend lid." };
  const { data: existing } = await admin.from("buddies").select("id, status")
    .eq("gym_id", profile.gym_id)
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`)
    .maybeSingle();
  if (existing) return { error: existing.status === "accepted" ? "Jullie zijn al buddies." : "Er loopt al een aanvraag." };
  const { error: insErr } = await supabase.from("buddies").insert({ gym_id: profile.gym_id, requester_id: user.id, addressee_id: target.id, status: "pending" });
  if (insErr) return { error: insErr.message };
  await sendBuddyRequest({ to: target.email, name: target.full_name, fromName: profile.full_name || "Een Fittin'-lid" });
  revalidatePath("/community");
  return { ok: true, message: `Buddy-aanvraag verstuurd naar ${target.full_name || "het lid"}.` };
}

// Invite a friend (who may not have an account) to join — sends them your referral code by email.
export async function inviteFriendByEmail(_prev, formData) {
  return inviteBuddy(formData);
}

export async function acceptBuddy(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  await supabase.from("buddies").update({ status: "accepted" }).eq("id", formData.get("id"));
  revalidatePath("/community");
  return { ok: true };
}

export async function removeBuddy(formData) {
  const { supabase, error } = await me();
  if (error) return { error };
  await supabase.from("buddies").delete().eq("id", formData.get("id"));
  revalidatePath("/community");
  return { ok: true };
}
