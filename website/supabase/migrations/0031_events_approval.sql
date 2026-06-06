-- 0031: events get an approval workflow (coach-created → admin-approved, or admin-created) and
-- are always paid via Stripe (never credits). event_signups tracks the checkout session.
alter table events add column if not exists status     text not null default 'approved'; -- pending | approved
alter table events add column if not exists coach_id   uuid references profiles(id) on delete set null;
alter table events add column if not exists created_by uuid references profiles(id) on delete set null;
create index if not exists events_status_idx on events(gym_id, status, starts_at);

alter table event_signups add column if not exists stripe_session_id text;
