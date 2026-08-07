-- Testaccounts markeren zodat ze nooit meetellen in cijfers.
--
-- Owner-regel (2026-08-07): "Achilius is een test account daar moet je nooit rekening mee houden."
--
-- Waarom een kolom en niet enkel een lijst in de code: de eigenaar moet een account zelf kunnen
-- markeren wanneer hij er een aanmaakt, zonder dat er een nieuwe versie gedeployd moet worden.
-- Zolang deze migratie niet toegepast is, valt lib/test-accounts.js terug op een e-mailadreslijst;
-- daarna schakelt die helper over op deze kolom en verandert er verder niets aan de app.
--
-- Bewust NIET verwijderend: de boekingen en tegoedregels van het testaccount blijven gewoon staan.
-- Dit is een live gym; wat er weg mag, beslist de eigenaar zelf.

alter table public.profiles
  add column if not exists is_test boolean not null default false;

comment on column public.profiles.is_test is
  'Testaccount: nooit meetellen in tellingen, omzet, rapporten of publieke lijsten.';

-- Het bekende testaccount meteen markeren.
update public.profiles set is_test = true where lower(email) = 'coach@fittin.be';

-- Gedeeltelijke index: de filters vragen bijna altijd "geef me de niet-test-rijen", en dat zijn er
-- veruit het meest. Een index op de kleine kant (is_test = true) houdt de opzoeking van de
-- uitsluitingslijst goedkoop zonder de rest te vertragen.
create index if not exists profiles_is_test_idx on public.profiles (gym_id) where is_test;
