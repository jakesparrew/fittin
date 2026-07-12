-- W3 — coach feedback to a client on their training. General note or optionally tied to one exercise.
-- Coach writes; client + coach (+ staff) read. Additive, RLS-scoped.

create table if not exists workout_feedback (
  id                  uuid primary key default gen_random_uuid(),
  gym_id              uuid not null references gyms(id) on delete cascade,
  coach_id            uuid not null references profiles(id) on delete cascade,
  client_id           uuid not null references profiles(id) on delete cascade,
  program_exercise_id uuid references program_exercises(id) on delete set null,
  body                text not null,
  created_at          timestamptz not null default now()
);

create index if not exists workout_feedback_client_idx on workout_feedback(client_id, created_at desc);

alter table workout_feedback enable row level security;
-- The coach writes their own feedback; the client + the coach (+ staff) can read it.
create policy wf_insert on workout_feedback for insert
  with check (coach_id = auth.uid() and gym_id = current_gym_id());
create policy wf_select on workout_feedback for select
  using (client_id = auth.uid() or coach_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy wf_delete on workout_feedback for delete
  using (coach_id = auth.uid());
