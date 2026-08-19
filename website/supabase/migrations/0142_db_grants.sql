-- 0142: twee rechten die opengebleven zijn na 0132 en 0137.
--
-- ─────────────────────────────────────────────────────────────── 1. de pv_-functies
-- WAAROM: 0137 sloot af met `revoke all on function public.pv_campaigns(...) from public`. Dat haalt
-- de PUBLIC-grant weg, maar NIET de expliciete grants die Supabase via default privileges aan anon
-- en authenticated uitdeelt op elke nieuwe functie in public. Nagemeten op de live databank:
--   proacl = {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Gevolg: met de publieke anon-sleutel, uitgelogd, gaf POST /rest/v1/rpc/pv_summary een 200 met
-- {"views":1429,"visitors":360,...}, en pv_campaigns de volledige campagne-tabel. Deze functies zijn
-- security definer, dus de RLS op page_views hield niets tegen. Dat is geen persoonsgegeven, maar het
-- is wel ons volledige verkeers- en advertentiebeeld dat elke bezoeker kon uitlezen.
--
-- Waarom intrekken veilig is: alle zeven worden uitsluitend met de service-role aangeroepen
-- (app/beheer/verkeer/page.jsx:26-34 en lib/weekreport.js:84-87, telkens via `admin.rpc`). De
-- service-role behoudt zijn recht, dus geen enkele aanroepplek breekt.
revoke execute on function public.pv_summary(timestamptz, timestamptz)                 from anon, authenticated;
revoke execute on function public.pv_daily(timestamptz, timestamptz)                   from anon, authenticated;
revoke execute on function public.pv_events(timestamptz, timestamptz)                  from anon, authenticated;
revoke execute on function public.pv_top_paths(timestamptz, timestamptz, int)          from anon, authenticated;
revoke execute on function public.pv_top_referrers(timestamptz, timestamptz, int)      from anon, authenticated;
revoke execute on function public.pv_path_visitors(timestamptz, timestamptz, text)     from anon, authenticated;
revoke execute on function public.pv_campaigns(timestamptz, timestamptz, int)          from anon, authenticated;

-- LET OP voor de volgende migratie die een functie aanmaakt: Supabase deelt EXECUTE automatisch uit
-- aan anon en authenticated. `revoke ... from public` volstaat niet om dat terug te draaien — het
-- moet per rol, zoals hierboven. Een globale `alter default privileges` zou dit in één keer
-- oplossen, maar breekt stilzwijgend elke toekomstige functie die de app wél met de
-- gebruikersclient aanroept (zoals join_free_event); daarom bewust per functie.

-- ────────────────────────────────────────────────────── 2. eigen betaalde inschrijving wissen
-- WAAROM: 0132 trok INSERT en UPDATE op event_signups in, maar DELETE bleef staan, en de policy uit
-- 0004 kijkt enkel naar eigenaarschap. Een lid kon dus op "Uitschrijven" klikken bij een BETALEND
-- event en zijn eigen bewijs van deelname wissen: de betaling blijft in payments staan, de plaats
-- komt vrij, en niemand ziet nog dat hij ooit ingeschreven was. Functioneel bewezen in een
-- terugdraaiende transactie: DELETE van een eigen inschrijving met paid=true verwijderde 1 rij.
--
-- Waarom de voorwaarde niet gewoon `paid = false` is: join_free_event (0132) zet paid=TRUE op een
-- GRATIS inschrijving — `paid` betekent hier "plaats bevestigd", niet "er is geld betaald". Op
-- `paid` filteren zou het uitschrijven voor gratis events breken. De echte scheidslijn is of er geld
-- aan hangt: een betalend event, of een rij met een Stripe-sessie. Ontbreekt het event (verwijderd),
-- dan valt de exists-controle op false → geen delete. Bewust dicht ipv open.
--
-- Personeel behoudt zijn volledige rechten; een lid dat van een betaald event af wil, gaat langs het
-- beheer, dat de plaats vrijgeeft én de betaling zichtbaar houdt.
drop policy if exists event_signups_delete on public.event_signups;
create policy event_signups_delete on public.event_signups for delete using (
  (
    event_signups.user_id = auth.uid()
    and event_signups.stripe_session_id is null
    and exists (
      select 1 from public.events e
      where e.id = event_signups.event_id and coalesce(e.price_cents, 0) = 0
    )
  )
  or (event_signups.gym_id = current_gym_id() and is_staff())
);

-- anon heeft hier niets te zoeken: zonder auth.uid() haalt hij de policy toch nooit, maar het recht
-- uitdelen aan een uitgelogde bezoeker is een uitnodiging voor de volgende policy-fout.
revoke delete on public.event_signups from anon;
