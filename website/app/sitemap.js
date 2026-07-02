import { createAdminClient } from "@/lib/supabase/admin";
import { coachSlug } from "@/lib/slug";

// Dynamic sitemap: the static marketing routes PLUS the long-tail content (± 900 exercise pages,
// public workouts, coach profiles) that previously had almost no crawlable inbound links.
export default async function sitemap() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
  const staticRoutes = ["", "/degym", "/personal-training", "/coaches", "/oefeningen", "/workouts", "/boeken", "/lidmaatschap", "/calorieen-berekenen", "/supplementen", "/events", "/huisregels", "/disclosure", "/privacy"];
  const entries = staticRoutes.map((r) => ({
    url: `${site}${r}`,
    changeFrequency: "weekly",
    priority: r === "" ? 1 : 0.8,
  }));

  // Long-tail content — best-effort: a DB hiccup must never break the sitemap (fall back to static).
  try {
    const admin = createAdminClient();
    const { data: gym } = await admin.from("gyms").select("id").eq("slug", "fittin").single();
    if (gym) {
      const [{ data: exercises }, { data: workouts }, { data: coaches }] = await Promise.all([
        admin.from("exercises").select("slug").eq("gym_id", gym.id).not("slug", "is", null),
        admin.from("programs").select("slug").eq("gym_id", gym.id).eq("is_public", true).not("slug", "is", null),
        admin.from("profiles").select("id, full_name").eq("gym_id", gym.id).eq("role", "coach").eq("coach_public", true),
      ]);
      for (const e of exercises || []) entries.push({ url: `${site}/oefeningen/${e.slug}`, changeFrequency: "monthly", priority: 0.5 });
      for (const w of workouts || []) entries.push({ url: `${site}/workouts/${w.slug}`, changeFrequency: "monthly", priority: 0.6 });
      for (const c of coaches || []) entries.push({ url: `${site}/coaches/${coachSlug(c)}`, changeFrequency: "monthly", priority: 0.6 });
    }
  } catch (e) {
    console.error("sitemap long-tail failed:", e?.message);
  }
  return entries;
}
