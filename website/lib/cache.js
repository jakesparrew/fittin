import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-side Data Cache for PUBLIC, rarely-changing rows so they don't hit Postgres on every
// render. Uses the admin client (no per-request cookies) and is busted by tag on edits.
// Cache tags: "gym", "services", "coaches". Bust with revalidateTag(...) in the relevant actions.

export const getGymCached = unstable_cache(
  async (slug = "fittin") => {
    const admin = createAdminClient();
    const { data } = await admin.from("gyms").select("*").eq("slug", slug).single();
    return data || null;
  },
  ["gym-by-slug"],
  { revalidate: 600, tags: ["gym"] }
);

export const getServicesCached = unstable_cache(
  async (gymId) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("services")
      .select("*")
      .eq("gym_id", gymId)
      .eq("active", true)
      .order("price_cents", { ascending: true });
    return data || [];
  },
  ["active-services"],
  { revalidate: 600, tags: ["services"] }
);

export const getPublicCoachesCached = unstable_cache(
  async (gymId) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, coach_pt_price_cents")
      .eq("gym_id", gymId)
      .eq("role", "coach")
      .order("full_name");
    return data || [];
  },
  ["public-coaches"],
  { revalidate: 300, tags: ["coaches"] }
);

export const getExercisesCached = unstable_cache(
  async (gymId) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("exercises")
      .select("id, name, slug, category, muscle, primary_muscles, secondary_muscles, equipment, difficulty, instructions, tips, image_url, animation_url, video_url, coach_id")
      .eq("gym_id", gymId)
      .order("name");
    return data || [];
  },
  ["exercises-library"],
  { revalidate: 300, tags: ["exercises"] }
);

export const getCoachAvailabilityCached = unstable_cache(
  async (gymId) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("coach_availability")
      .select("coach_id, weekday, from_hour, to_hour")
      .eq("gym_id", gymId);
    return data || [];
  },
  ["coach-availability"],
  { revalidate: 300, tags: ["coaches"] }
);
