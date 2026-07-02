-- 0102_gym_secrets.sql
-- Move the two SECRETS off the world-readable gyms row (gyms_select is `using (true)` — readable by
-- any authenticated user, and the anon key ships in every browser). iban (0028) and access_code
-- (0069) must live in the service-role-only gym_integrations table (same pattern as the Nuki token,
-- 0078). We copy existing values across, then the app reads/writes only the gym_integrations copies.
-- The old gyms columns are LEFT IN PLACE (additive discipline) but are no longer read by the app.

alter table gym_integrations add column if not exists iban text;
alter table gym_integrations add column if not exists access_code text;     -- static door code (Nuki-off fallback)

-- Backfill from the retiring gyms columns for every gym that already has a row or needs one.
insert into gym_integrations (gym_id, iban, access_code)
select g.id, g.iban, g.access_code
from gyms g
on conflict (gym_id) do update
  set iban = coalesce(gym_integrations.iban, excluded.iban),
      access_code = coalesce(gym_integrations.access_code, excluded.access_code);
