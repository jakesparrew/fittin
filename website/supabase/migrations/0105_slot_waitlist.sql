-- Batch 5.5 — slot waitlist: capture demand on full slots instead of letting it evaporate.
-- Additive only. When a slot frees (cancel/reschedule), the earliest waiters get notified.

create table if not exists slot_waitlist (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  slot_instant timestamptz not null,           -- the exact slot start being waited on
  created_at   timestamptz not null default now(),
  notified_at  timestamptz                      -- set once we've told this waiter the slot freed
);

-- One waitlist entry per member per slot.
create unique index if not exists slot_waitlist_unique on slot_waitlist(gym_id, slot_instant, user_id);
-- Fast "who is waiting for this slot, oldest first" lookup when a slot frees.
create index if not exists slot_waitlist_slot_idx on slot_waitlist(gym_id, slot_instant, created_at);

alter table slot_waitlist enable row level security;

-- A member manages their own waitlist entries; staff can see the gym's demand.
create policy slot_waitlist_select on slot_waitlist for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy slot_waitlist_insert on slot_waitlist for insert
  with check (user_id = auth.uid() and gym_id = current_gym_id());
create policy slot_waitlist_delete on slot_waitlist for delete
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
