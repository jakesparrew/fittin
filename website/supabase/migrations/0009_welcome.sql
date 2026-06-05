-- 0009: anti-abuse for the FittinWelcome free first session.
-- The free session must be "activated" by putting a card on file (no charge). The card's
-- Stripe fingerprint is recorded — the same physical card can't claim a free session on
-- multiple accounts, so creating new accounts no longer farms free sessions.

create table if not exists welcome_claims (
  fingerprint text primary key,
  user_id     uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table welcome_claims enable row level security; -- service-role only, no policies

-- welcome_status: 'unclaimed' (needs card) | 'eligible' (card ok, free session ready)
--                 | 'used' (already booked the free session) | 'blocked' (card already used elsewhere)
alter table profiles add column if not exists welcome_status text not null default 'unclaimed';
update profiles set welcome_status = 'used' where welcome_code_used = true and welcome_status = 'unclaimed';
