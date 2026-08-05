-- 0125 — Vastleggen wanneer iemand de voorwaarden aanvaardde (en welke versie).
--
-- WAAROM. Twee dingen uit Boek VI WER moeten aantoonbaar zijn, niet alleen "ergens vermeld":
--   1. dat de consument de algemene voorwaarden aanvaard heeft vóór de aankoop;
--   2. dat hij bij een beurtenkaart of abonnement UITDRUKKELIJK gevraagd heeft om de uitvoering
--      meteen te starten, met kennis van het gevolg voor zijn herroepingsrecht (art. VI.53, 1°).
-- Zonder bewijs valt in een geschil niet aan te tonen dat dit gebeurd is, en dan geldt in de
-- praktijk het volledige herroepingsrecht alsnog. Vandaar één rij per aanvaarding.
--
-- Ook de gezondheidsgegevens (lichaamsmetingen, art. 9 AVG) horen hier thuis: die mogen enkel op
-- basis van uitdrukkelijke toestemming, en de AVG vraagt dat je die toestemming kan aantonen
-- (art. 7.1). Intrekken registreren we als een rij met withdrawn_at.

create table if not exists legal_consents (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid references gyms(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  -- 'voorwaarden'      = algemene voorwaarden aanvaard
  -- 'directe_start'    = uitdrukkelijk verzoek tot onmiddellijke uitvoering (herroeping)
  -- 'gezondheidsdata'  = uitdrukkelijke toestemming voor lichaamsmetingen/trainingslogs
  kind         text not null check (kind in ('voorwaarden', 'directe_start', 'gezondheidsdata')),
  doc_version  text,                       -- welke versie van het document ("v2 — 2026-08-05")
  context      text,                       -- waar het gebeurde, bv. 'beurtenkaart' of 'abonnement'
  accepted_at  timestamptz not null default now(),
  withdrawn_at timestamptz,                -- ingetrokken toestemming (enkel zinvol bij gezondheidsdata)
  created_at   timestamptz not null default now()
);

create index if not exists legal_consents_user_idx on legal_consents(user_id, kind, accepted_at desc);

alter table legal_consents enable row level security;

-- Een lid mag zijn eigen toestemmingen zien (recht van inzage), maar ze nooit zelf aanpassen of
-- wissen — anders is het geen bewijs meer. Schrijven gebeurt uitsluitend server-side met de
-- service-role, vanuit de aankoop- en toestemmingsacties.
drop policy if exists legal_consents_own_read on legal_consents;
create policy legal_consents_own_read on legal_consents
  for select using (auth.uid() = user_id);
