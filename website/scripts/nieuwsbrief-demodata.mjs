// Zet tijdelijke demodata op het TESTACCOUNT (is_test = true) zodat de voortgangsschermen iets
// tonen op de schermafdrukken voor de nieuwsbrief.
//
// Twee regels waar ik me aan hou omdat dit een live databank is:
//   1. Enkel het testaccount. Nooit data van een echt lid in een mail naar 716 mensen.
//   2. Elk aangemaakt id wordt weggeschreven naar _demo-ids.json, zodat `_demo.mjs --weg` exact
//      díe rijen wist en niets anders. Geen "delete where user_id = ..." — dat zou ook rijen
//      wissen die er al stonden.
import { createClient } from "@supabase/supabase-js";
import { writeFile, readFile } from "node:fs/promises";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const eis = (n, r) => { if (r.error) throw new Error(n + ": " + r.error.message); return r.data; };
const IDS = "scripts/nieuwsbrief-demodata-ids.json";

if (process.argv.includes("--weg")) {
  const ids = JSON.parse(await readFile(IDS, "utf8"));
  for (const l of ids.logs || []) eis("del log", await s.from("workout_logs").delete().eq("id", l));
  // exercise_favorites heeft geen id-kolom: de sleutel is het paar (user_id, exercise_id).
  for (const f of ids.favs || []) eis("del fav", await s.from("exercise_favorites").delete().eq("user_id", f.user_id).eq("exercise_id", f.exercise_id));
  // program_days en program_exercises hangen met ON DELETE CASCADE aan het programma.
  if (ids.program) eis("del program", await s.from("programs").delete().eq("id", ids.program));
  console.log(`opgeruimd: ${(ids.logs || []).length} logs, ${(ids.favs || []).length} favorieten, programma ${ids.program ? "1" : "0"}`);
  process.exit(0);
}

const [prof] = eis("prof", await s.from("profiles").select("id, gym_id, full_name, is_test").eq("email", "coach@fittin.be"));
if (!prof?.is_test) throw new Error("Dit is geen testaccount — gestopt.");
const { id: uid, gym_id: gym } = prof;

// Echte oefeningen uit de bibliotheek, gekozen op herkenbaarheid én omdat ze een foto hebben.
const slugs = ["barbell-bench-press-medium-grip", "barbell-squat", "pullups", "barbell-deadlift", "dumbbell-bicep-curl", "seated-cable-rows"];
const ex = eis("ex", await s.from("exercises").select("id, name, slug").in("slug", slugs));
const bySlug = Object.fromEntries(ex.map((e) => [e.slug, e]));
const kies = (s_) => bySlug[s_] || ex[0];
console.log("gevonden oefeningen:", ex.map((e) => e.slug).join(", "));

// Na élke stap wegschrijven, niet pas op het einde: als het script halverwege faalt, moet het
// opruimen nog altijd weten wat er intussen wél is aangemaakt.
const ids = { logs: [], favs: [], program: null };
const bewaar = () => writeFile(IDS, JSON.stringify(ids, null, 1));

// ---- Schema ----
const prog = eis("program", await s.from("programs").insert({
  gym_id: gym, member_id: uid, name: "Push / Pull / Legs", is_active: true,
  subtitle: "3 dagen per week", level: "Gemiddeld", est_minutes: 55,
}).select("id, share_token")) [0];
ids.program = prog.id;
await bewaar();

const dagen = eis("days", await s.from("program_days").insert([
  { program_id: prog.id, day_no: 1, name: "Push" },
  { program_id: prog.id, day_no: 2, name: "Pull" },
]).select("id, day_no"));
const d1 = dagen.find((d) => d.day_no === 1).id, d2 = dagen.find((d) => d.day_no === 2).id;

const pes = eis("pe", await s.from("program_exercises").insert([
  { program_day_id: d1, exercise_id: kies("barbell-bench-press-medium-grip").id, sets: 4, reps: 8, rest_sec: 120, position: 1, target_weight_kg: 70 },
  { program_day_id: d1, exercise_id: kies("barbell-squat").id, sets: 4, reps: 6, rest_sec: 150, position: 2, target_weight_kg: 90 },
  { program_day_id: d2, exercise_id: kies("seated-cable-rows").id, sets: 4, reps: 10, rest_sec: 90, position: 1 },
  { program_day_id: d2, exercise_id: kies("dumbbell-bicep-curl").id, sets: 3, reps: 12, rest_sec: 60, position: 2 },
]).select("id, exercise_id, program_day_id"));

// ---- Voortgang: 8 weken opbouw, zodat de grafiek een échte lijn toont ----
const dag = (terug) => new Date(Date.now() - terug * 86400000).toISOString().slice(0, 10);
const bench = pes[0], squat = pes[1], row = pes[2];
const rijen = [];
for (let w = 7; w >= 0; w--) {
  const t = w * 7 + 1;
  rijen.push({ gym_id: gym, user_id: uid, program_exercise_id: bench.id, logged_on: dag(t), is_pr: w <= 1, sets_json: [
    { reps: 8, weight_kg: 60 + (7 - w) * 2.5 }, { reps: 8, weight_kg: 60 + (7 - w) * 2.5 }, { reps: 7, weight_kg: 60 + (7 - w) * 2.5 },
  ] });
  rijen.push({ gym_id: gym, user_id: uid, program_exercise_id: squat.id, logged_on: dag(t), is_pr: false, sets_json: [
    { reps: 6, weight_kg: 80 + (7 - w) * 5 }, { reps: 6, weight_kg: 80 + (7 - w) * 5 },
  ] });
  if (w % 2 === 0) rijen.push({ gym_id: gym, user_id: uid, program_exercise_id: row.id, logged_on: dag(t - 3), is_pr: false, sets_json: [
    { reps: 10, weight_kg: 45 + (7 - w) * 2 }, { reps: 10, weight_kg: 45 + (7 - w) * 2 },
  ] });
}
const logs = eis("logs", await s.from("workout_logs").insert(rijen).select("id"));
ids.logs = logs.map((l) => l.id);
await bewaar();

// ---- Favorieten ----
const favRijen = ["barbell-bench-press-medium-grip", "pullups", "barbell-deadlift", "dumbbell-bicep-curl"]
  .map((sl) => bySlug[sl]).filter(Boolean)
  .map((e) => ({ user_id: uid, exercise_id: e.id }));
if (favRijen.length) {
  const favs = eis("favs", await s.from("exercise_favorites").insert(favRijen).select("user_id, exercise_id"));
  ids.favs = favs;
}

await bewaar();
console.log(`klaar: programma ${prog.id}, ${ids.logs.length} logs, ${ids.favs.length} favorieten`);
console.log("share_token:", prog.share_token || "(nog geen — via de UI aanzetten)");
