-- 0042: direct messages between a coach and one of their clients (one thread per pair).
create table if not exists coach_messages (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  coach_id   uuid not null references profiles(id) on delete cascade,
  client_id  uuid not null references profiles(id) on delete cascade,
  sender_id  uuid not null references profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists coach_messages_thread_idx on coach_messages(coach_id, client_id, created_at);
alter table coach_messages enable row level security;

-- Only the two people in the thread can read it; sender must be one of them.
drop policy if exists coach_messages_select on coach_messages;
create policy coach_messages_select on coach_messages for select
  using (auth.uid() = coach_id or auth.uid() = client_id);
drop policy if exists coach_messages_insert on coach_messages;
create policy coach_messages_insert on coach_messages for insert
  with check (sender_id = auth.uid() and (auth.uid() = coach_id or auth.uid() = client_id) and gym_id = current_gym_id());
