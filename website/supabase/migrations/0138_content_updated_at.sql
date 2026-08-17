-- 0138: wijzigingsdatum op de publieke contenttabellen, zodat de sitemap een échte <lastmod> kan
-- meegeven. Zonder deze kolommen laat app/sitemap.js lastModified bewust weg: een verzonnen (of te
-- oude) datum houdt net de hercrawl tegen die we willen nadat een oefening vertaald is.
--
-- Niet vereist om de site te laten draaien: de sitemap detecteert de ontbrekende kolom en valt
-- terug op een select zonder updated_at. Na deze migratie verschijnt lastModified vanzelf.

alter table exercises add column if not exists updated_at timestamptz not null default now();
alter table programs  add column if not exists updated_at timestamptz not null default now();

-- Bestaande rijen kregen hierboven now() als default; zet ze terug op hun aanmaakdatum, anders
-- claimt de sitemap dat 885 oefeningen vandaag gewijzigd zijn.
update exercises set updated_at = created_at where updated_at > created_at;
update programs  set updated_at = created_at where updated_at > created_at;

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists exercises_touch_updated_at on exercises;
create trigger exercises_touch_updated_at before update on exercises
  for each row execute function touch_updated_at();

drop trigger if exists programs_touch_updated_at on programs;
create trigger programs_touch_updated_at before update on programs
  for each row execute function touch_updated_at();
