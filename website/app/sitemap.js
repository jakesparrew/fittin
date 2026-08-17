import { createAdminClient } from "@/lib/supabase/admin";
import { coachSlug } from "@/lib/slug";
import { isDutchExercise } from "@/lib/seo";

// Dynamic sitemap: de statische marketingroutes PLUS de long-tail (publieke workouts, coachprofielen,
// Nederlandstalige oefeningen) die anders nauwelijks crawlbare inbound links heeft.
//
// Twee bewuste keuzes:
// - changeFrequency/priority staan er niet meer in: Google negeert beide velden al jaren.
// - lastModified zetten we alléén als de databank een echte wijzigingsdatum heeft. Een verzonnen
//   datum is erger dan geen datum: een te oude waarde houdt net de hercrawl tegen die we willen
//   nadat een oefening vertaald is.
async function fetchRows(build) {
  // exercises/programs/profiles hebben (nog) geen updated_at — migratie 0138 voegt ze toe. Zolang
  // die niet gedraaid is, faalt de select op die kolom en halen we dezelfde rijen zonder op.
  const withMod = await build(true);
  if (!withMod.error) return withMod.data || [];
  const plain = await build(false);
  return plain.data || [];
}

const cols = (base, withMod) => (withMod ? `${base}, updated_at` : base);
const modified = (row) => (row?.updated_at ? { lastModified: new Date(row.updated_at) } : {});

export default async function sitemap() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
  // /events staat er bewust niet in: geen enkele pagina linkt ernaar en dezelfde events staan al
  // op /boeken. /plannen, /community, /login en /uitschrijven horen achter een login of zijn geen
  // landingspagina — die staan in robots.js op disallow.
  const staticRoutes = ["", "/degym", "/personal-training", "/coaches", "/oefeningen", "/workouts", "/boeken", "/lidmaatschap", "/calorieen-berekenen", "/supplementen", "/hulp", "/huisregels", "/disclosure", "/privacy", "/voorwaarden", "/cookies"];
  const entries = staticRoutes.map((r) => ({ url: `${site}${r}` }));

  // Long-tail content — best-effort: a DB hiccup must never break the sitemap (fall back to static).
  try {
    const admin = createAdminClient();
    const { data: gym } = await admin.from("gyms").select("id").eq("slug", "fittin").single();
    if (gym) {
      const [exercises, workouts, coaches] = await Promise.all([
        fetchRows((m) => admin.from("exercises").select(cols("slug, category, source", m)).eq("gym_id", gym.id).not("slug", "is", null)),
        fetchRows((m) => admin.from("programs").select(cols("slug", m)).eq("gym_id", gym.id).eq("is_public", true).not("slug", "is", null)),
        fetchRows((m) => admin.from("profiles").select(cols("id, full_name", m)).eq("gym_id", gym.id).eq("role", "coach").eq("coach_public", true)),
      ]);
      // Category hubs first — die anchoren de topical cluster en zijn zelf wél Nederlandstalig.
      const cats = Array.from(new Set(exercises.map((e) => e.category).filter(Boolean)));
      for (const c of cats) entries.push({ url: `${site}/oefeningen/categorie/${c}` });
      // Enkel Nederlandstalige oefeningpagina's: de overgenomen Engelse teksten staan op noindex.
      for (const e of exercises.filter(isDutchExercise)) entries.push({ url: `${site}/oefeningen/${e.slug}`, ...modified(e) });
      for (const w of workouts) entries.push({ url: `${site}/workouts/${w.slug}`, ...modified(w) });
      for (const c of coaches) entries.push({ url: `${site}/coaches/${coachSlug(c)}`, ...modified(c) });
    }
  } catch (e) {
    console.error("sitemap long-tail failed:", e?.message);
  }
  return entries;
}
