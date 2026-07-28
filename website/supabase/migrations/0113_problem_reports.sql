-- 0113 — problem_reports: members deliberately report an issue ("de deur ging niet open",
-- "ik kon niet betalen"), distinct from automatic JS crash logs in client_errors.
-- Additive only; safe on live.

create table if not exists problem_reports (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid references gyms(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  message text not null,
  page text,
  status text not null default 'open', -- open | afgehandeld
  created_at timestamptz not null default now()
);

create index if not exists problem_reports_gym_idx on problem_reports(gym_id, status, created_at desc);

alter table problem_reports enable row level security;

-- A logged-in member may file a report for themself in their own gym.
drop policy if exists pr_insert on problem_reports;
create policy pr_insert on problem_reports for insert
  with check (user_id = auth.uid() and gym_id = current_gym_id());

-- Members see their own reports (so the UI can confirm "we ontvingen je melding"); staff see all.
drop policy if exists pr_select on problem_reports;
create policy pr_select on problem_reports for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));

-- Only staff update (mark afgehandeld).
drop policy if exists pr_update on problem_reports;
create policy pr_update on problem_reports for update
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());
