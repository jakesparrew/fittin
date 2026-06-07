import { cache } from "react";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";

// Where each role lands after login / when they open the app.
export function roleHome(role) {
  return role === "beheerder" ? "/beheer" : role === "coach" ? "/coach" : "/account";
}

// Current authenticated user + their profile row (or nulls). Safe before config.
// Wrapped in React cache() so layout + page + context helpers share ONE auth/profile
// round-trip per request instead of 2-3 separate hits to GoTrue/Postgres.
export const getSessionProfile = cache(async function getSessionProfile() {
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
});
