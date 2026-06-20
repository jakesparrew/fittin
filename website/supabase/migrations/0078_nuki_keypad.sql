-- 0078_nuki_keypad.sql
-- Per-booking Nuki keypad door codes: a fresh 6-digit PIN is created on the smartlock ~lead minutes
-- before each confirmed booking, delivered to the member, and removed after the session ends.
--
-- The Nuki API token is a SECRET, so it must NOT live on the gyms table (gyms has RLS `select using(true)`
-- — world-readable). It goes in a dedicated gym_integrations table with RLS enabled and NO policies,
-- so only the service-role key (createAdminClient) can read/write it; it never reaches the browser.

create table if not exists gym_integrations (
  gym_id            uuid primary key references gyms(id) on delete cascade,
  nuki_enabled      boolean not null default false,   -- per-booking keypad-code feature on/off
  nuki_api_token    text,                             -- Nuki Web API token (secret)
  nuki_smartlock_id text,                             -- target smartlock id
  keypad_lead_min   int not null default 5,           -- create + deliver the code this many min before start
  keypad_grace_min  int not null default 15,          -- keep the code valid / before cleanup, this many min after end
  updated_at        timestamptz not null default now()
);
alter table gym_integrations enable row level security;
-- Intentionally no policies → only the service-role key can touch this table. Secrets stay server-side.

-- Per-booking keypad-code bookkeeping (the code is the member's own → readable by the booking owner).
alter table bookings add column if not exists nuki_code text;        -- the active 6-digit PIN (null once cleaned)
alter table bookings add column if not exists nuki_auth_name text;   -- the Nuki authorization name, for exact-match cleanup
alter table bookings add column if not exists nuki_cleaned boolean not null default false; -- code revoked after end/cancel

-- Helps the cleanup pass find codes still to revoke.
create index if not exists bookings_nuki_active on bookings (gym_id) where (nuki_code is not null and nuki_cleaned = false);
