-- Batch 3.2 — private per-client notes for coaches (visible only to the authoring coach).
-- One editable note per coach⇄client pair.

create table if not exists coach_client_notes (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  coach_id   uuid not null references profiles(id) on delete cascade,
  client_id  uuid not null references profiles(id) on delete cascade,
  body       text,
  updated_at timestamptz not null default now(),
  unique (coach_id, client_id)
);

alter table coach_client_notes enable row level security;
-- A coach reads/writes only their OWN notes. (Written via service role in the action too.)
create policy ccn_own on coach_client_notes for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and gym_id = current_gym_id());
