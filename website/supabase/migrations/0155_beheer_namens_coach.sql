-- 0155 — "Bekijk als coach" mag voortaan ook wijzigen, en daar hoort één ontbrekende policy bij.
--
-- De beheerder kan sinds vandaag het profiel, de beschikbaarheid, de oefeningen en de programma's
-- van een coach rechtzetten zonder diens wachtwoord te vragen. Drie van die tabellen hadden al een
-- staf-policy (coach_availability, exercises, programs); coach_client_notes niet — daar staat
-- alleen "coach_id = auth.uid()". Een beheerder die een notitie bewerkt, kreeg dus een weigering.
--
-- Waarom juist DEZE tabel er wel bij mag en workout_feedback / coach_messages niet: een notitie is
-- privé en van de coach zelf. Feedback en berichten komen bij de CLIENT binnen als "van je coach";
-- die namens iemand anders versturen laat de client geloven dat de coach hem schreef. Dat blijft
-- dus geblokkeerd, in de code én hier in de databank.
--
-- Let op de vorm: bestaande policy laten staan (de coach zelf houdt zijn eigen weg) en een tweede
-- ernaast zetten. Policies zijn OR-gecombineerd, dus dit verruimt precies met "staf in deze gym".
drop policy if exists ccn_staff on public.coach_client_notes;
create policy ccn_staff on public.coach_client_notes
  for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());
