"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGymCached } from "@/lib/cache";

// Public, server-side library search (so the client doesn't load the whole ~900-row library).
// Returns light cards for the grid. Matches on name or muscle.
export async function searchLibrary(q, category) {
  const gym = await getGymCached();
  if (!gym) return [];
  const admin = createAdminClient();
  let query = admin
    .from("exercises")
    .select("id, name, slug, category, muscle, primary_muscles, difficulty, equipment, image_url")
    .eq("gym_id", gym.id)
    .order("name")
    .limit(60);
  if (category && category !== "alle") query = query.eq("category", category);
  // Strip PostgREST/LIKE meta-chars so the term can't break out of the .or() filter (injection).
  const term = String(q || "").trim().replace(/[%,()*:\\]/g, " ").trim().slice(0, 60);
  if (term) query = query.or(`name.ilike.%${term}%,muscle.ilike.%${term}%`);
  const { data } = await query;
  return data || [];
}
