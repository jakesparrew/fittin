-- 0071: public "Workouts" — ready-made, follow-along workouts that EVERYONE can browse + follow,
-- plus richer per-exercise prescription. A public workout is a program with is_public=true (also
-- is_template=true so members can copy it into their own plans). The catalog is served via the
-- service-role cached readers (like /oefeningen) so logged-out visitors can browse too; these RLS
-- policies additionally let authenticated members read public workouts + log against them directly.

-- ---- Workout metadata on programs ----
alter table programs add column if not exists is_public   boolean not null default false;
alter table programs add column if not exists slug        text;
alter table programs add column if not exists subtitle    text;        -- short one-liner
alter table programs add column if not exists description text;        -- intro paragraph
alter table programs add column if not exists level       text;        -- Beginner|Gemiddeld|Gevorderd
alter table programs add column if not exists est_minutes int;
alter table programs add column if not exists focus       text;
alter table programs add column if not exists category    text;        -- borst|schouders|rug|... (card accent)
alter table programs add column if not exists tips        text[];
alter table programs add column if not exists sort_order  int not null default 0;
create unique index if not exists programs_gym_slug_key on programs(gym_id, slug) where slug is not null;
create index if not exists programs_public_idx on programs(gym_id, is_public) where is_public;

-- ---- Richer per-exercise prescription ----
alter table program_exercises add column if not exists section  text;  -- Warming-up|Hoofdoefening|Accessoire|Finisher
alter table program_exercises add column if not exists rep_text text;  -- "8-12", "10 per kant", "30 sec", "AMRAP"
alter table program_exercises add column if not exists tempo    text;
alter table program_exercises add column if not exists notes    text;  -- form cue

-- ---- RLS: anyone in the gym (incl. plain members) may READ public workouts + their days/exercises ----
drop policy if exists programs_public_browse on programs;
create policy programs_public_browse on programs for select
  using (is_public and gym_id = current_gym_id());

drop policy if exists program_days_public_browse on program_days;
create policy program_days_public_browse on program_days for select
  using (exists (select 1 from programs p
                 where p.id = program_days.program_id and p.is_public and p.gym_id = current_gym_id()));

drop policy if exists program_exercises_public_browse on program_exercises;
create policy program_exercises_public_browse on program_exercises for select
  using (exists (select 1 from program_days d
                 join programs p on p.id = d.program_id
                 where d.id = program_exercises.program_day_id and p.is_public and p.gym_id = current_gym_id()));

-- Staff publish/unpublish: only coach/beheerder may flip is_public + set workout metadata.
-- (programs_write already restricts writes to gym staff; is_public/slug ride on that policy.)
