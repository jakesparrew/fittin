// Imports the public-domain free-exercise-db (~873 exercises) into the gym's exercise library.
// Idempotent: upserts on (gym_id, slug) with ignoreDuplicates, so hand-written seeds are kept.
// Usage: node --env-file=.env.local scripts/import-exercises.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("Missing Supabase env"); process.exit(1); }
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CDN = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/";
const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const MUSCLE = { abdominals: "Buik", abductors: "Abductoren", adductors: "Adductoren", biceps: "Biceps", calves: "Kuiten", chest: "Borst", forearms: "Onderarmen", glutes: "Bilspieren", hamstrings: "Hamstrings", lats: "Lats", "lower back": "Onderrug", "middle back": "Bovenrug", neck: "Nek", quadriceps: "Quadriceps", shoulders: "Schouders", traps: "Trapezius", triceps: "Triceps" };
const CATEGORY = { chest: "borst", lats: "rug", "middle back": "rug", "lower back": "rug", traps: "rug", quadriceps: "benen", hamstrings: "benen", calves: "benen", glutes: "benen", abductors: "benen", adductors: "benen", shoulders: "schouders", neck: "schouders", biceps: "armen", triceps: "armen", forearms: "armen", abdominals: "core" };
const EQUIP = { "body only": "Lichaamsgewicht", barbell: "Barbell", dumbbell: "Dumbbell", machine: "Machine", cable: "Cable", kettlebell: "Kettlebell", bands: "Weerstandsbanden", "medicine ball": "Medicine ball", "exercise ball": "Fitnessbal", "e-z curl bar": "EZ-bar", "foam roll": "Foam roller", other: "Overig", none: null };
const LEVEL = { beginner: "beginner", intermediate: "intermediate", expert: "gevorderd" };
const tMuscle = (m) => MUSCLE[m] || (m ? m[0].toUpperCase() + m.slice(1) : m);
const tEquip = (e) => (e in EQUIP ? EQUIP[e] : e ? e[0].toUpperCase() + e.slice(1) : null);

async function main() {
  const { data: gym, error: gErr } = await admin.from("gyms").select("id").eq("slug", "fittin").single();
  if (gErr || !gym) { console.error("No fittin gym:", gErr?.message); process.exit(1); }

  const res = await fetch(CDN.replace("/exercises/", "/dist/exercises.json"));
  const data = await res.json();
  console.log(`Fetched ${data.length} exercises from free-exercise-db`);

  const seen = new Set();
  const rows = [];
  for (const e of data) {
    const slug = slugify(e.id || e.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const frames = (e.images || []).map((p) => CDN + p);
    const primary = (e.primaryMuscles || []).map(tMuscle);
    rows.push({
      gym_id: gym.id,
      coach_id: null,
      name: e.name,
      slug,
      category: CATEGORY[(e.primaryMuscles || [])[0]] || "overig",
      primary_muscles: primary,
      secondary_muscles: (e.secondaryMuscles || []).map(tMuscle),
      muscle: primary[0] || null,
      equipment: tEquip(e.equipment),
      difficulty: LEVEL[e.level] || null,
      mechanic: e.mechanic || null,
      force: e.force || null,
      instructions: e.instructions || [],
      frames,
      image_url: frames[0] || null,
      source: "free-exercise-db",
    });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await admin.from("exercises").upsert(batch, { onConflict: "gym_id,slug", ignoreDuplicates: true });
    if (error) { console.error("Batch failed:", error.message); process.exit(1); }
    inserted += batch.length;
    process.stdout.write(`\r→ upserted ${inserted}/${rows.length}`);
  }
  const { count } = await admin.from("exercises").select("id", { count: "exact", head: true }).eq("gym_id", gym.id);
  console.log(`\n✓ import complete. Library now has ${count} exercises.`);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
