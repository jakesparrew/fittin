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

// Light list for the library grid (no instructions/frames) — keeps the payload small at ~900 rows.
export const getExercisesCached = unstable_cache(
  async (gymId) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("exercises")
      .select("id, name, slug, category, muscle, primary_muscles, difficulty, equipment, image_url")
      .eq("gym_id", gymId)
      .order("name");
    return data || [];
  },
  ["exercises-library"],
  { revalidate: 300, tags: ["exercises"] }
);

// A few alternatives in the same category (for the detail page) — queried at the DB, not by
// loading the whole library.
export const getAlternativesByCategory = unstable_cache(
  async (gymId, category, excludeSlug) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("exercises")
      .select("id, name, slug, category, muscle, primary_muscles, image_url")
      .eq("gym_id", gymId)
      .eq("category", category)
      .neq("slug", excludeSlug)
      .order("name")
      .limit(12);
    return data || [];
  },
  ["exercise-alternatives"],
  { revalidate: 300, tags: ["exercises"] }
);

// Full single exercise (frames, instructions, muscles, …) for the detail page.
export const getExerciseBySlug = unstable_cache(
  async (gymId, slug) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("exercises")
      .select("id, name, slug, category, muscle, primary_muscles, secondary_muscles, equipment, difficulty, mechanic, force, instructions, tips, image_url, animation_url, video_url, frames")
      .eq("gym_id", gymId)
      .eq("slug", slug)
      .maybeSingle();
    return data || null;
  },
  ["exercise-by-slug"],
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

// Public follow-along workouts catalog (cards). Tag "workouts" — bust on publish/edit.
export const getPublicWorkoutsCached = unstable_cache(
  async (gymId) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("programs")
      .select("id, slug, name, subtitle, level, est_minutes, focus, category, sort_order, program_days(program_exercises(id))")
      .eq("gym_id", gymId)
      .eq("is_public", true)
      .order("sort_order");
    return (data || []).map((p) => ({
      id: p.id, slug: p.slug, name: p.name, subtitle: p.subtitle, level: p.level,
      est_minutes: p.est_minutes, focus: p.focus, category: p.category,
      exerciseCount: (p.program_days || []).reduce((n, d) => n + (d.program_exercises?.length || 0), 0),
    }));
  },
  ["public-workouts"],
  { revalidate: 300, tags: ["workouts"] }
);

// One public workout with its full session (day + exercises with rich media). Tag "workouts".
export const getPublicWorkoutBySlug = unstable_cache(
  async (gymId, slug) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("programs")
      .select(
        "id, slug, name, subtitle, description, level, est_minutes, focus, category, tips, program_days(id, day_no, name, program_exercises(id, sets, reps, rest_sec, position, section, rep_text, tempo, notes, exercise:exercises(id, name, slug, category, muscle, primary_muscles, secondary_muscles, equipment, difficulty, mechanic, force, instructions, tips, image_url, animation_url, video_url, frames)))"
      )
      .eq("gym_id", gymId)
      .eq("is_public", true)
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return null;
    const day = (data.program_days || []).slice().sort((a, b) => a.day_no - b.day_no)[0];
    const exercises = ((day && day.program_exercises) || []).slice().sort((a, b) => a.position - b.position);
    return { ...data, exercises };
  },
  ["public-workout-by-slug"],
  { revalidate: 300, tags: ["workouts"] }
);
