-- 0040: audit log of coach actions (booked/cancelled sessions, payment requests, programs,
-- events, session requests) — for the coach's own overview and admin oversight.
create table if not exists coach_activity (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  coach_id   uuid not null references profiles(id) on delete cascade,
  type       text not null,            -- booked | cancelled | payment_request | program | event | request | profile
  summary    text not null,
  ref_id     uuid,
  created_at timestamptz not null default now()
);
create index if not exists coach_activity_idx on coach_activity(coach_id, created_at desc);
create index if not exists coach_activity_gym_idx on coach_activity(gym_id, created_at desc);
alter table coach_activity enable row level security;
drop policy if exists coach_activity_select on coach_activity;
create policy coach_activity_select on coach_activity for select
  using (coach_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
-- inserts are service-role.
