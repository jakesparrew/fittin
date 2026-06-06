-- 0034: per-recipient notifications (the social-style 'bell'). Activity feeds (member/coach/admin)
-- are derived from existing tables; this table is for "someone interacted with you" + announcements.
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,  -- recipient
  actor_id   uuid references profiles(id) on delete set null,          -- who triggered it (optional)
  type       text not null,           -- buddy_request | buddy_accepted | booking_invite | coach_booked | payment_request | credits | coach_assigned | event | challenge | system
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, read, created_at desc);
alter table notifications enable row level security;

-- Recipient reads/updates own; staff may read gym-wide (admin overview). Inserts are service-role.
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
