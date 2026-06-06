-- 0032: per-client coach pricing + coach payment requests (members pay coach sessions via Stripe).

-- A coach's price for a specific client (overrides their default per-session rate).
alter table coach_clients add column if not exists price_cents int not null default 0;

-- A coach asks a client to pay for a session via the platform.
create table if not exists coach_payment_requests (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references gyms(id) on delete cascade,
  coach_id          uuid not null references profiles(id) on delete cascade,
  client_id         uuid not null references profiles(id) on delete cascade,
  amount_cents      int  not null,
  description       text,
  status            text not null default 'pending',  -- pending | paid | cancelled
  stripe_session_id text,
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists cpr_coach_idx  on coach_payment_requests(coach_id, created_at desc);
create index if not exists cpr_client_idx on coach_payment_requests(client_id, status);
alter table coach_payment_requests enable row level security;

-- Coach sees their own requests; the client sees requests addressed to them; staff see gym-wide.
drop policy if exists cpr_select on coach_payment_requests;
create policy cpr_select on coach_payment_requests for select
  using (coach_id = auth.uid() or client_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
-- A coach creates requests for their own clients.
drop policy if exists cpr_insert on coach_payment_requests;
create policy cpr_insert on coach_payment_requests for insert
  with check (coach_id = auth.uid() and gym_id = current_gym_id());
-- A coach can cancel their own pending request (payment confirmation is service-role via webhook).
drop policy if exists cpr_update on coach_payment_requests;
create policy cpr_update on coach_payment_requests for update
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
