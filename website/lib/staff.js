import { createClient } from "./supabase/server";

// Guard for staff-only server actions. Returns { supabase, profile } or { error }.
export async function requireStaff(beheerderOnly = false) {
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
  if (beheerderOnly && profile.role !== "beheerder") return { error: "Alleen beheerder." };
  return { supabase, profile, userId: user.id };
}
