// Helpers for parsing the rich exercise form (shared by the coach + admin editors).
export const slugify = (s) =>
  String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const csv = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
export const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);

// Build the exercises row from the form, deriving a gym-unique slug. `excludeId` skips the row
// being edited so re-saving keeps its slug.
export async function exerciseRowFromForm(supabase, formData, gymId, extra = {}, excludeId = null) {
  const name = String(formData.get("name") || "").trim();
  const slug = await uniqueSlug(supabase, gymId, name, excludeId);
  const orNull = (k) => formData.get(k) || null;
  return {
    gym_id: gymId,
    name,
    slug,
    muscle: orNull("muscle") || (csv(formData.get("primary_muscles"))[0] ?? null),
    category: orNull("category"),
    primary_muscles: csv(formData.get("primary_muscles")),
    secondary_muscles: csv(formData.get("secondary_muscles")),
    equipment: orNull("equipment"),
    difficulty: orNull("difficulty"),
    instructions: lines(formData.get("instructions")),
    tips: orNull("tips"),
    image_url: orNull("image_url"),
    animation_url: orNull("animation_url"),
    video_url: orNull("video_url"),
    ...extra,
  };
}

export async function uniqueSlug(supabase, gymId, name, excludeId) {
  const base = slugify(name) || "oefening";
  let slug = base;
  for (let i = 2; i <= 50; i++) {
    let q = supabase.from("exercises").select("id").eq("gym_id", gymId).eq("slug", slug).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}
