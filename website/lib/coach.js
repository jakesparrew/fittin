import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { getSessionProfile } from "./auth";

export const VIEW_AS_COOKIE = "fittin_view_coach";

// Coach id a beheerder is currently "viewing as" (read-only). Only honored when the REAL authenticated
// user is a beheerder — the cookie alone can NEVER grant access or escalate privileges.
export async function viewingAsCoachId() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== "beheerder") return null;
  const jar = await cookies();
  return jar.get(VIEW_AS_COOKIE)?.value || null;
}

// True while a beheerder is in "bekijk als coach"-modus → used to block write-actions (read-only).
export async function viewAsActive() {
  return !!(await viewingAsCoachId());
}

// The full coach profile a beheerder is viewing as (or null).
export async function getViewAsCoach() {
  const id = await viewingAsCoachId();
  if (!id) return null;
  const { profile } = await getSessionProfile();
  const { data } = await createAdminClient().from("profiles").select("*").eq("id", id).eq("gym_id", profile.gym_id).maybeSingle();
  return data || null;
}

// Shared context for /coach pages: authenticated coach (or beheerder) + gym + client.
export async function getCoachContext() {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) return null;
  if (!["coach", "beheerder"].includes(profile.role)) return null;
  const supabase = await createClient();
  // Beheerder "bekijk als coach": render the target coach's data. Writes are blocked elsewhere
  // (requireCoach / sendMessage) so this is strictly read-only.
  if (profile.role === "beheerder") {
    const viewing = await getViewAsCoach();
    if (viewing) {
      const { data: gym } = await supabase.from("gyms").select("*").eq("id", viewing.gym_id).single();
      return { supabase, profile: viewing, gym, userId: viewing.id, viewingAs: { coachName: viewing.full_name || "coach", realName: profile.full_name || "Beheerder" } };
    }
  }
  const { data: gym } = await supabase.from("gyms").select("*").eq("id", profile.gym_id).single();
  return { supabase, profile, gym, userId: user.id };
}
