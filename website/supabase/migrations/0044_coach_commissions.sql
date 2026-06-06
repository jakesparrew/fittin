-- 0044: coach affiliate — a coach earns a one-time commission when a member they referred makes
-- their first paid booking. Coaches share their existing referral_code.
create table if not exists coach_commissions (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  coach_id    uuid not null references profiles(id) on delete cascade,
  member_id   uuid references profiles(id) on delete set null,
  amount_cents int not null,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (coach_id, member_id)
);
create index if not exists coach_commissions_idx on coach_commissions(coach_id, created_at desc);
alter table coach_commissions enable row level security;
drop policy if exists coach_commissions_select on coach_commissions;
create policy coach_commissions_select on coach_commissions for select
  using (coach_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
-- inserts are service-role (webhook).
