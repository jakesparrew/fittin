// Seeds a couple of gym workout templates members can copy. Idempotent (skips by name).
// Usage: node --env-file=.env.local scripts/seed-templates.mjs
import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// [slug, sets, reps, rest]
const TEMPLATES = [
  {
    name: "Full body — 3 dagen",
    days: [
      ["Dag 1", [["barbell-squat", 4, 6, 120], ["bench-press", 4, 8, 90], ["barbell-row", 4, 8, 90], ["overhead-press", 3, 10, 90], ["plank", 3, 45, 60]]],
      ["Dag 2", [["romanian-deadlift", 4, 8, 120], ["incline-dumbbell-press", 4, 10, 90], ["lat-pulldown", 4, 10, 90], ["lateral-raise", 3, 15, 45], ["hanging-leg-raise", 3, 12, 60]]],
      ["Dag 3", [["leg-press", 4, 10, 90], ["push-up", 3, 12, 60], ["seated-cable-row", 4, 10, 90], ["biceps-curl", 3, 12, 45], ["triceps-pushdown", 3, 12, 45]]],
    ],
  },
  {
    name: "Push / Pull / Legs — 3 dagen",
    days: [
      ["Push", [["bench-press", 4, 8, 90], ["overhead-press", 4, 8, 90], ["incline-dumbbell-press", 3, 10, 75], ["lateral-raise", 3, 15, 45], ["triceps-pushdown", 3, 12, 45]]],
      ["Pull", [["pull-up", 4, 8, 90], ["barbell-row", 4, 8, 90], ["lat-pulldown", 3, 10, 75], ["seated-cable-row", 3, 10, 75], ["biceps-curl", 3, 12, 45], ["face-pull", 3, 15, 45]]],
      ["Legs", [["barbell-squat", 4, 6, 120], ["romanian-deadlift", 4, 8, 120], ["leg-press", 3, 12, 90], ["walking-lunge", 3, 12, 60], ["leg-curl", 3, 12, 60]]],
    ],
  },
];

async function main() {
  const { data: gym } = await admin.from("gyms").select("id").eq("slug", "fittin").single();
  if (!gym) { console.error("No fittin gym"); process.exit(1); }
  const { data: exs } = await admin.from("exercises").select("id, slug").eq("gym_id", gym.id);
  const idBySlug = new Map((exs || []).map((e) => [e.slug, e.id]));

  for (const t of TEMPLATES) {
    const { data: existing } = await admin.from("programs").select("id").eq("gym_id", gym.id).eq("name", t.name).eq("is_template", true).maybeSingle();
    if (existing) { console.log(`skip (exists): ${t.name}`); continue; }
    const { data: prog } = await admin.from("programs").insert({ gym_id: gym.id, name: t.name, is_template: true, member_id: null, coach_id: null }).select("id").single();
    let dayNo = 1;
    for (const [dayName, rows] of t.days) {
      const { data: day } = await admin.from("program_days").insert({ program_id: prog.id, day_no: dayNo++, name: dayName }).select("id").single();
      const peRows = rows
        .map(([slug, sets, reps, rest], i) => ({ program_day_id: day.id, exercise_id: idBySlug.get(slug), sets, reps, rest_sec: rest, position: i }))
        .filter((r) => r.exercise_id);
      if (peRows.length) await admin.from("program_exercises").insert(peRows);
    }
    console.log(`created template: ${t.name}`);
  }
  console.log("✓ templates seeded");
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
