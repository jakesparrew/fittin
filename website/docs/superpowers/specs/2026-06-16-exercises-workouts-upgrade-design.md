# Spec — Oefeningen & Workouts upgrade (Fittin')

**Date:** 2026-06-16 · **Status:** approved-to-build (user: "fix it all, keep going")

## Goal
Turn the thin exercise library (name + muscle + optional `video_url`, never shown to members)
and the basic training page into a best-in-class exercise & workout experience: **animated/visual
exercise demos, clear explanations, rich metadata, a real workout player, and progress tracking.**

## Current state (baseline)
- `exercises(id, gym_id, coach_id, name, muscle, video_url)` — minimal; `video_url` not displayed.
- `programs → program_days → program_exercises(sets, reps, rest_sec, position)`; coach builds &
  assigns (now cloned per member).
- `workout_logs(program_exercise_id, sets_json [{set,reps,weight_kg}], is_pr, logged_on)`.
- Member `/training`: list of days/exercises, "Klaar ✓" toggle + a collapsed sets/weight form,
  progress bar, coach message thread. No exercise detail, no media, no per-exercise history.

## Key decision — exercise media source (reversible default)
Build the model + UI to support rich media via **per-exercise URLs** (`image_url`, `animation_url`
for a GIF/MP4 loop, `video_url` for a full demo). Seed a **curated set of ~30 common gym
exercises** with written instructions, muscles, equipment & difficulty (authored here, no external
dependency, no cost, no licensing risk). Coaches/admin fill media URLs (paste a GIF/MP4/YouTube
link). The schema is provider-agnostic, so a bulk animated-GIF source (e.g. the public-domain
free-exercise-db, or a paid GIF API) can be imported later without rework. **No proprietary/paid
API is wired in this phase.**

## Scope (v1)
1. **Rich exercise model** (migration `0060`): add `slug, category, primary_muscles text[],
   secondary_muscles text[], equipment, difficulty, instructions text[], tips, image_url,
   animation_url`; keep `name, muscle, video_url`. Search index on name. Seed ~30 exercises
   (gym-wide, `coach_id null`) with full content.
2. **Exercise detail view** (`/oefeningen/[slug]` + a reusable `ExerciseDetail`): animation/video
   player with poster fallback, primary/secondary muscles, equipment, difficulty, numbered
   instructions, coach tips. Used by the library, the workout player, and the program builder.
3. **Exercise library browser** (`/oefeningen`): searchable/filterable grid (muscle, equipment),
   public-ish to members; cards show thumbnail + muscle + difficulty.
4. **Workout player** (rebuild `/training`): per-exercise inline set logging (sets × reps × kg,
   prefilled from target & last session), mark-done, rest timer, "log session", streak; tap an
   exercise → detail (animation + instructions); show last-time & PR per exercise. Keep coach
   thread + coach note. Match `app_mock.png` styling.
5. **Per-exercise progress**: history + simple line chart (reuse `WeightChart`) + PR badge
   (heaviest set) computed from `workout_logs`.
6. **Coach/admin editor upgrade**: capture the rich fields (instructions, muscles, equipment,
   difficulty, media URLs) in `coach/oefeningen` + `beheer/oefeningen`; keep it quick to add.

## Out of scope (later)
Bulk import of an external exercise dataset; AI exercise generation; supersets/circuits in the
player; in-app video hosting/upload for animations (URLs only for now); native push.

## Data model changes
- `exercises`: + `slug text`, `category text`, `primary_muscles text[]`, `secondary_muscles
  text[]`, `equipment text`, `difficulty text` (beginner/intermediate/gevorderd), `instructions
  text[]`, `tips text`, `image_url text`, `animation_url text`. Backfill `slug` from name; keep
  `muscle` (legacy display) in sync with `primary_muscles[1]` where possible.
- RLS unchanged (gym-scoped read for members/staff; write = staff). Members get SELECT on
  gym exercises (add a read policy if missing).
- No change to `programs/program_days/program_exercises/workout_logs` shape; logging UX improves.

## UX / components
- `ExerciseMedia` (animation→video→image→placeholder fallback), `ExerciseDetail`,
  `ExerciseLibrary` (grid + filters, client), `WorkoutPlayer` (client; inline set rows, rest
  timer, optimistic done), `ExerciseProgress` (history + chart + PR).
- Dutch (Vlaams) copy, brand tokens, rounded-2xl/3xl, green pills — consistent with the site.

## Success criteria
- A member opens `/training`, taps an exercise, sees an animated demo + clear steps + target,
  logs sets×reps×kg with a rest timer, and sees their last session + PR.
- A member can browse the full exercise library with demos even without a program.
- A coach adds an exercise with instructions/muscles/equipment/media in under a minute.
- Build passes; no regressions to booking/credits/coach flows.

## Build order
0060 schema + seed → ExerciseMedia/Detail + library + read RLS → coach/admin editor → workout
player rebuild → per-exercise progress/PR → build & verify. Then the deferred audit polish.
