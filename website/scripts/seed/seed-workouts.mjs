// Seeds the public follow-along workouts from scripts/seed/workouts.json (slug/category/sort come
// from each entry, with a fallback to META for the original chest/shoulder/back keys).
// Public workout = program with is_public=true + is_template=true (browsable AND copyable).
// Idempotent: replaces by (gym_id, slug). Run: node scripts/seed/seed-workouts.mjs  (env vars required).
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const META = {
  chest: { slug: "borst", category: "borst", sort: 1 },
  shoulder: { slug: "schouders", category: "schouders", sort: 2 },
  back: { slug: "rug", category: "rug", sort: 3 },
};
const firstInt = (s) => {
  const m = String(s || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

async function main() {
  const workouts = JSON.parse(await readFile(new URL("./workouts.json", import.meta.url), "utf8"));
  const { data: gym } = await admin.from("gyms").select("id").eq("slug", "fittin").single();
  if (!gym) { console.error("No fittin gym"); process.exit(1); }
  const { data: exs } = await admin.from("exercises").select("id, slug").eq("gym_id", gym.id);
  const idBySlug = new Map((exs || []).map((e) => [e.slug, e.id]));

  for (const w of workouts) {
    const meta = META[w.key] || {};
    const slug = w.slug || meta.slug;
    const category = w.category || meta.category;
    const sort = w.sort ?? meta.sort ?? 0;
    if (!slug) { console.log("skip — geen slug voor", w.key); continue; }
    await admin.from("programs").delete().eq("gym_id", gym.id).eq("slug", slug); // cascade days/exercises
    const { data: prog, error: pe } = await admin.from("programs").insert({
      gym_id: gym.id, name: w.name, is_template: true, is_public: true, member_id: null, coach_id: null,
      slug, subtitle: w.subtitle, description: w.intro, level: w.level, est_minutes: w.est_minutes,
      focus: w.focus, category, tips: w.tips || [], sort_order: sort,
    }).select("id").single();
    if (pe) { console.error("program insert", w.key, pe.message); process.exit(1); }
    const { data: day } = await admin.from("program_days").insert({ program_id: prog.id, day_no: 1, name: w.focus || "Workout" }).select("id").single();
    const rows = w.exercises.map((e, i) => {
      const exId = idBySlug.get(e.slug);
      if (!exId) { console.error("MISSING slug", e.slug); return null; }
      return {
        program_day_id: day.id, exercise_id: exId, sets: e.sets, reps: firstInt(e.rep_text), rest_sec: e.rest_sec,
        position: i, section: e.section, rep_text: e.rep_text, tempo: e.tempo || null, notes: e.notes,
      };
    });
    if (rows.includes(null)) process.exit(1);
    const { error: ee } = await admin.from("program_exercises").insert(rows);
    if (ee) { console.error("pe insert", w.key, ee.message); process.exit(1); }
    console.log(`seeded workout: ${w.name} (${slug}) — ${rows.length} exercises`);
  }
  console.log("✓ public workouts seeded");
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
