-- 0156 — is_staff() betekent "coach OF beheerder". In 0154 en 0155 stond het waar "beheerder"
-- bedoeld was, en dat opende twee dingen voor alle acht coaches:
--
--   * coach_client_notes (0155) — de privénotities die een coach over zijn client schrijft, waren
--     leesbaar EN overschrijfbaar door elke andere coach. Dat is precies het tegenovergestelde van
--     wat die tabel is: een kladblok dat niemand anders ziet.
--   * coach-aanmeldingen (0154) — de cv's en foto's van sollicitanten. Een cv draagt een adres en
--     een geboortedatum, en de kandidaat stuurde het naar de gym, niet naar de concurrentie.
--
-- Gevonden bij de doorlichting van 03-09-2026, dezelfde avond dat beide migraties toegepast werden.
-- Er is in die tussentijd geen enkele coach-aanmelding met bijlage binnengekomen en er stond nog
-- geen enkele clientnotitie van een andere coach, dus er is niets gelekt — maar de deur stond open.
--
-- De les voor volgende keer: is_staff() lezen als "personeel" is te grof zodra het om gegevens van
-- één specifieke coach of om sollicitanten gaat. Gebruik dan is_beheerder().

-- ---------- 1. Privénotities: de coach zelf, of de beheerder ----------
-- ccn_own (coach_id = auth.uid()) blijft staan; policies zijn OR-gecombineerd, dus de coach houdt
-- zijn eigen weg. Deze policy verruimt alleen naar de beheerder.
drop policy if exists ccn_staff on public.coach_client_notes;
create policy ccn_beheer on public.coach_client_notes
  for all
  using (gym_id = current_gym_id() and is_beheerder())
  with check (gym_id = current_gym_id() and is_beheerder());

-- ---------- 2. Sollicitatiebijlagen: alleen de beheerder ----------
drop policy if exists coach_application_files_staff on public.coach_application_files;
create policy coach_application_files_beheer on public.coach_application_files
  for select
  using (gym_id = current_gym_id() and is_beheerder());

drop policy if exists coach_aanmeldingen_staff_select on storage.objects;
create policy coach_aanmeldingen_beheer_select on storage.objects
  for select
  using (bucket_id = 'coach-aanmeldingen' and public.is_beheerder());
