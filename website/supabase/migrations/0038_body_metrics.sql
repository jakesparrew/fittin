-- 0038: members log their height + weight over time (for progress graphs and, later, AI coaching).
alter table profiles add column if not exists height_cm     int;
alter table profiles add column if not exists goal_weight_kg numeric(5,1);
-- height/goal are self-editable (profile UPDATE was locked to full_name/phone in 0015).
grant update (height_cm, goal_weight_kg) on profiles to authenticated;

create table if not exists body_metrics (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  weight_kg  numeric(5,1) not null,
  logged_on  date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);
create index if not exists body_metrics_user_idx on body_metrics(user_id, logged_on);
alter table body_metrics enable row level security;

-- Members manage their own; staff (coach/admin) can read gym-wide for coaching.
drop policy if exists body_metrics_select on body_metrics;
create policy body_metrics_select on body_metrics for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
drop policy if exists body_metrics_write on body_metrics;
create policy body_metrics_write on body_metrics for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and gym_id = current_gym_id());
