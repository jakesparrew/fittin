-- 0143: wijzigingsdatum op profiles, zodat de coachpagina's in de sitemap een échte <lastmod>
-- krijgen.
--
-- WAAROM: 0138 zette updated_at op exercises en programs, maar app/sitemap.js vraagt de kolom ook op
-- voor de coachprofielen. Op profiles bestaat ze niet (nagemeten: 0 kolommen updated_at op profiles,
-- wél op exercises en programs), dus die select faalt bij élke sitemapbuild en valt terug op de
-- variant zonder datum. Zichtbaar gevolg op de live sitemap: 51 <url> maar 28 <lastmod> — de
-- oefeningen en workouts dragen een datum, de coaches niet. Elke build betaalt daarvoor ook een
-- overbodige mislukte query.
--
-- Dezelfde aanpak als 0138 en bewust zelfstandig: touch_updated_at() wordt hier opnieuw gedefinieerd
-- (identiek), zodat dit bestand ook klopt als 0138 om welke reden ook niet gedraaid is.

alter table profiles add column if not exists updated_at timestamptz not null default now();

-- Bestaande rijen kregen hierboven now(); zet ze terug op hun aanmaakdatum, anders claimt de sitemap
-- dat elke coach vandaag zijn profiel gewijzigd heeft en houdt een verzonnen verse datum net de
-- hercrawl tegen die we willen na een échte wijziging.
--
-- LET OP — dit is een DATAMIGRATIE. Ze is veilig zolang ze één keer draait: na een echte
-- profielwijziging staat updated_at > created_at, en een tweede run zou die wijzigingsdatum
-- weggooien. Sinds 0141 houdt public.schema_migrations bij wat gedraaid is en weigert
-- scripts/migrate-mgmt.mjs een tweede run.
update profiles set updated_at = created_at where updated_at > created_at;

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on profiles;
create trigger profiles_touch_updated_at before update on profiles
  for each row execute function touch_updated_at();
