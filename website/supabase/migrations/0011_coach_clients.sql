-- 0011: coach ↔ client assignments. The superadmin links coaches to members (and back).
-- A member can have one primary coach; a coach has many clients.

create table if not exists coach_clients (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  coach_id   uuid not null references profiles(id) on delete cascade,
  client_id  uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (gym_id, coach_id, client_id)
);
create index if not exists coach_clients_coach_idx  on coach_clients(coach_id);
create index if not exists coach_clients_client_idx on coach_clients(client_id);

alter table coach_clients enable row level security;

-- Staff manage every assignment in their gym. A coach or the client can read their own.
drop policy if exists coach_clients_select on coach_clients;
create policy coach_clients_select on coach_clients for select
  using (gym_id = current_gym_id() and (is_staff() or coach_id = auth.uid() or client_id = auth.uid()));

drop policy if exists coach_clients_write on coach_clients;
create policy coach_clients_write on coach_clients for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());
