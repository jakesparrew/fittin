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
  // exercises/programs kregen updated_at in migratie 0138, profiles in 0143. Zolang een van beide
  // niet gedraaid is, faalt de select op die kolom en halen we dezelfde rijen zonder op.
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
  const staticRoutes = ["", "/degym", "/personal-training", "/coaches", "/coach-worden", "/oefeningen", "/workouts", "/boeken", "/lidmaatschap", "/calorieen-berekenen", "/hulp", "/huisregels", "/disclosure", "/privacy", "/voorwaarden", "/cookies"];
  const entries = staticRoutes.map((r) => ({ url: `${site}${r}` }));

  // Long-tail content — best-effort: a DB hiccup must never break the sitemap (fall back to static).
  try {
    const admin = createAdminClient();
    const { data: gym } = await admin.from("gyms").select("id").eq("slug", "fittin").single();
    if (gym) {
      const [exercises, workouts, coaches, metInhoud] = await Promise.all([
        fetchRows((m) => admin.from("exercises").select(cols("slug, category, source", m)).eq("gym_id", gym.id).not("slug", "is", null)),
        fetchRows((m) => admin.from("programs").select(cols("slug", m)).eq("gym_id", gym.id).eq("is_public", true).not("slug", "is", null)),
        fetchRows((m) => admin.from("profiles").select(cols("id, full_name", m)).eq("gym_id", gym.id).eq("role", "coach").eq("coach_public", true)),
        // Inhoudsdrempel, apart opgevraagd omdat `instructions` van de hele bibliotheek ~580 kB is en
        // we hier enkel de slugs nodig hebben. Databankzijde filteren: null én de lege array eruit.
        admin.from("exercises").select("slug").eq("gym_id", gym.id).not("instructions", "is", null).not("instructions", "eq", "{}"),
      ]);
      // Category hubs first — die anchoren de topical cluster en zijn zelf wél Nederlandstalig.
      const cats = Array.from(new Set(exercises.map((e) => e.category).filter(Boolean)));
      for (const c of cats) entries.push({ url: `${site}/oefeningen/categorie/${c}` });
      // Enkel Nederlandstalige oefeningpagina's MET inhoud. isDutchExercise kijkt alleen naar source,
      // en dat is te grof: de lege eigen rij 'pompem' (source='gym', alle inhoudskolommen null) bood
      // zo een pagina van 165 tekens aan Google aan, tegenover 661 voor een ingevulde oefening. Zelf
      // een kale URL aandragen is een belofte die de pagina niet waarmaakt. Deze drempel houdt ook
      // de volgende lege rij tegen. Faalt de inhoudsquery, dan filteren we niet: een halve sitemap
      // is erger dan één zwakke pagina.
      const inhoud = metInhoud.error ? null : new Set((metInhoud.data || []).map((r) => r.slug));
      const heeftInhoud = (e) => !inhoud || inhoud.has(e.slug);
      for (const e of exercises.filter((e) => isDutchExercise(e) && heeftInhoud(e))) entries.push({ url: `${site}/oefeningen/${e.slug}`, ...modified(e) });
      for (const w of workouts) entries.push({ url: `${site}/workouts/${w.slug}`, ...modified(w) });
      for (const c of coaches) entries.push({ url: `${site}/coaches/${coachSlug(c)}`, ...modified(c) });
    }
  } catch (e) {
    console.error("sitemap long-tail failed:", e?.message);
  }
  return entries;
}
