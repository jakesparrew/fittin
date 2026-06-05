import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";

// Where each role lands after login / when they open the app.
export function roleHome(role) {
  return role === "beheerder" ? "/beheer" : role === "coach" ? "/coach" : "/account";
}

// Current authenticated user + their profile row (or nulls). Safe before config.
export async function getSessionProfile() {
  if (!isSupabaseConfigured) return { user: null, profile: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return { user, profile };
}
