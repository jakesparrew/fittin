-- 0068: log of e-mail invites to non-members, used to rate-limit (anti mass-mailing).
-- Written/read only by the service-role booking action; RLS on with no member policy.
create table if not exists email_invites (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid references gyms(id) on delete cascade,
  inviter_id uuid not null references profiles(id) on delete cascade,
  email      text not null,
  booking_id uuid references bookings(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists email_invites_inviter_idx on email_invites(inviter_id, created_at);
alter table email_invites enable row level security;
