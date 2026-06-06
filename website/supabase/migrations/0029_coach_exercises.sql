-- 0029: let coaches own their own exercises. coach_id null = gym-wide library (admin-made);
-- coach_id set = that coach's personal exercise. RLS unchanged (gym-wide read, staff write) so
-- members still see exercise names in their assigned program.
alter table exercises add column if not exists coach_id uuid references profiles(id) on delete set null;
create index if not exists exercises_coach_idx on exercises(coach_id);
