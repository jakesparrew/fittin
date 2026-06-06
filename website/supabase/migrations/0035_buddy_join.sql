-- 0035: "I booked the gym, want to come?" — a member asks an accepted buddy to join a booking.
-- The buddy accepts (→ added as a participant) or declines.
create table if not exists booking_join_requests (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  from_user  uuid not null references profiles(id) on delete cascade,
  to_user    uuid not null references profiles(id) on delete cascade,
  status     text not null default 'pending',  -- pending | accepted | declined
  created_at timestamptz not null default now(),
  unique (booking_id, to_user)
);
create index if not exists bjr_to_idx on booking_join_requests(to_user, status);
create index if not exists bjr_from_idx on booking_join_requests(from_user, booking_id);
alter table booking_join_requests enable row level security;

drop policy if exists bjr_select on booking_join_requests;
create policy bjr_select on booking_join_requests for select
  using (from_user = auth.uid() or to_user = auth.uid() or (gym_id = current_gym_id() and is_staff()));
drop policy if exists bjr_insert on booking_join_requests;
create policy bjr_insert on booking_join_requests for insert
  with check (from_user = auth.uid() and gym_id = current_gym_id());
drop policy if exists bjr_update on booking_join_requests;
create policy bjr_update on booking_join_requests for update
  using (to_user = auth.uid() or from_user = auth.uid());
