import { createClient } from "./supabase/server";
import { getSessionProfile } from "./auth";

// Shared context for /coach pages: authenticated coach (or beheerder) + gym + client.
export async function getCoachContext() {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) return null;
  if (!["coach", "beheerder"].includes(profile.role)) return null;
  const supabase = await createClient();
  const { data: gym } = await supabase.from("gyms").select("*").eq("id", profile.gym_id).single();
  return { supabase, profile, gym, userId: user.id };
}
