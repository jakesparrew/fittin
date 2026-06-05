-- 0012: payments ledger. Every successful Stripe payment is recorded here by the webhook,
-- so the superadmin can see what each user paid (bookings, bundles, subscriptions, coach credits).

create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  user_id      uuid references profiles(id) on delete set null, -- keep history if a user is removed
  amount_cents int  not null,
  currency     text not null default 'eur',
  kind         text not null,            -- booking | beurtenkaart | abonnement | coach_credits | overig
  description  text,
  stripe_id    text unique,              -- checkout session / invoice id → idempotent
  status       text not null default 'betaald',
  created_at   timestamptz not null default now()
);
create index if not exists payments_user_idx on payments(user_id);
create index if not exists payments_gym_idx  on payments(gym_id, created_at desc);

alter table payments enable row level security;

-- Staff read every payment in their gym; a member reads their own. Writes are service-role (webhook).
drop policy if exists payments_select on payments;
create policy payments_select on payments for select
  using (gym_id = current_gym_id() and (is_staff() or user_id = auth.uid()));
