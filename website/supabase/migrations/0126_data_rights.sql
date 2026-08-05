-- 0126 — Recht op verwijdering aanvraagbaar maken (art. 17 AVG).
--
-- Het privacybeleid beloofde verwijdering, maar er was geen enkele knop en dus geen spoor van een
-- aanvraag. De AVG geeft de verwerkingsverantwoordelijke één maand om te antwoorden; zonder
-- registratie van het moment van de aanvraag valt die termijn niet te bewaken.
--
-- Bewust GEEN automatische harde verwijdering: dit is een productiedatabase met boekhoudkundige
-- verplichtingen (facturen moeten 7 jaar bewaard blijven) en met boekingen waar andere leden aan
-- vasthangen. De aanvraag wordt geregistreerd en zichtbaar gemaakt voor de beheerder, die ze
-- uitvoert. Zo blijft "verwijderen" een bewuste, controleerbare handeling.
alter table profiles add column if not exists deletion_requested_at timestamptz;

comment on column profiles.deletion_requested_at is
  'Wanneer dit lid zelf om verwijdering van zijn account vroeg (art. 17 AVG). Beheerder moet binnen 30 dagen handelen. NULL = geen openstaande aanvraag.';

create index if not exists profiles_deletion_requested_idx
  on profiles (deletion_requested_at) where deletion_requested_at is not null;
