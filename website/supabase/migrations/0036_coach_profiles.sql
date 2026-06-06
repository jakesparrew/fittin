-- 0036: public coach profiles (shown on the site, bookable). Coaches fill these in their dashboard.
alter table profiles add column if not exists coach_bio       text;
alter table profiles add column if not exists coach_specialty text;
alter table profiles add column if not exists coach_photo_url text;
alter table profiles add column if not exists coach_pricelist text;   -- free text, e.g. "1 sessie € 40 · 10-beurten € 350"
alter table profiles add column if not exists coach_public    boolean not null default false;

-- Allow anyone to read the public-facing fields of coaches (so /coaches works for anon visitors).
drop policy if exists profiles_public_coaches on profiles;
create policy profiles_public_coaches on profiles for select
  using (role = 'coach' and coach_public = true);
