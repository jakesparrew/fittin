-- 0026: coaches request session-credits from the superadmin (besides buying by card); +
-- day-before session reminders.

create table if not exists coach_session_requests (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  coach_id    uuid not null references profiles(id) on delete cascade,
  qty         int not null,
  status      text not null default 'pending',  -- pending | approved | declined
  note        text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null
);
create index if not exists coach_session_requests_idx on coach_session_requests(gym_id, status);
alter table coach_session_requests enable row level security;

drop policy if exists coach_requests_select on coach_session_requests;
create policy coach_requests_select on coach_session_requests for select
  using (gym_id = current_gym_id() and (coach_id = auth.uid() or is_staff()));
drop policy if exists coach_requests_insert on coach_session_requests;
create policy coach_requests_insert on coach_session_requests for insert
  with check (gym_id = current_gym_id() and coach_id = auth.uid());
drop policy if exists coach_requests_update on coach_session_requests;
create policy coach_requests_update on coach_session_requests for update
  using (gym_id = current_gym_id() and is_staff());

-- One-shot day-before reminder flag.
alter table bookings add column if not exists reminder_sent boolean not null default false;
