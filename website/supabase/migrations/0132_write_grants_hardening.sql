-- Schrijfrechten dichttrekken op de tabellen waar geld en toegang aan hangen.
--
-- Wat er mis was (nagemeten op de live databank op 17-08-2026):
--   `authenticated` had INSERT op ALLE kolommen van `bookings`, en de enige policy die dat afremde
--   controleerde alleen `user_id = auth.uid() and gym_id = current_gym_id()`. Niets over `paid`,
--   `price_cents` of `status`. Een ingelogd lid kon dus met de publieke anon-sleutel rechtstreeks
--   een rij wegschrijven met paid=true en status='bevestigd', Stripe volledig overslaan, en
--   vervolgens gewoon de deurcode krijgen. Hetzelfde gold voor `event_signups` (paid=true op een
--   betalend event) en voor `payments` (zelf een betaalbewijs verzinnen).
--
-- Er is GEEN misbruik gevonden: geen enkele betaalde boeking zonder bijhorende betaling of
-- tegoedafboeking, en geen betaalde event-inschrijving zonder Stripe-sessie.
--
-- Waarom intrekken veilig is: elke plek in de app die deze rijen aanmaakt doet dat via een
-- SECURITY DEFINER-functie van `postgres` (create_booking, admin_create_booking, coach_book_session,
-- reserve_event_seat) of via de service-role. Die zijn per definitie ongevoelig voor de rechten van
-- `anon`/`authenticated`. Nagegaan met een volledige zoektocht door app/, lib/ en pg_proc.
--
-- Wat bewust BLIJFT staan:
--   * UPDATE op bookings(cancelled_at, status, stripe_session_id) — de coach annuleert via een
--     gebruikersgebonden update (app/coach/actions.js:247) en de boekflow schrijft zelf de
--     stripe_session_id weg (app/(site)/boeken/actions.js:206). Intrekken zou dat breken.
--   * De brede TRUNCATE-grants uit de Supabase-standaard: PostgREST kan geen TRUNCATE uitvoeren,
--     dus die zijn lelijk maar niet bereikbaar. Apart opruimen, niet in een beveiligingsmigratie.

-- ---------------------------------------------------------------- bookings
revoke insert on public.bookings from anon, authenticated;

-- Tweede laag, voor het geval het recht ooit opnieuw wordt uitgedeeld: een lid mag via de tabel
-- nooit een betaalde of bevestigde boeking aanmaken. Personeel boekt via admin_create_booking.
drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings
  for insert with check (
    user_id = auth.uid()
    and gym_id = current_gym_id()
    and coalesce(paid, false) = false
    and coalesce(price_cents, 0) = 0
  );

-- ---------------------------------------------------------------- event_signups
-- De betalende route liep al via reserve_event_seat; alleen de GRATIS route schreef nog
-- rechtstreeks weg met paid=true. Die krijgt hieronder een eigen functie, zodat het recht weg kan.
revoke insert, update on public.event_signups from anon, authenticated;

-- Gratis event bijwonen. Doet in één transactie wat de server-actie eerst in drie losse queries
-- deed: bestaan, capaciteit en inschrijving. Dat sluit meteen de race waarbij twee mensen
-- tegelijk de laatste plaats van een vol gratis event konden nemen.
create or replace function public.join_free_event(p_event uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_gym uuid; v_cap int; v_status text; v_start timestamptz; v_price int;
  v_taken int; v_existing uuid; v_existing_paid boolean; v_id uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;

  select gym_id, capacity, status, starts_at, coalesce(price_cents, 0)
    into v_gym, v_cap, v_status, v_start, v_price
    from events where id = p_event;

  if v_gym is null or v_status <> 'approved' then raise exception 'Event niet gevonden.' using errcode='P0001'; end if;
  if v_start < now() then raise exception 'Dit event is al geweest.' using errcode='P0001'; end if;
  -- Betalende events horen hier niet: die moeten langs reserve_event_seat en Stripe.
  if v_price > 0 then raise exception 'Dit event is betalend.' using errcode='P0001'; end if;

  select id, paid into v_existing, v_existing_paid from event_signups where event_id = p_event and user_id = v_uid;
  if coalesce(v_existing_paid, false) then raise exception 'Je bent al ingeschreven.' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event::text, 0));
  select count(*) into v_taken from event_signups where event_id = p_event and user_id <> v_uid and paid = true;
  if v_taken >= coalesce(v_cap, 0) then raise exception 'Dit event is volzet.' using errcode='P0001'; end if;

  if v_existing is not null then
    update event_signups set paid = true where id = v_existing;
    return v_existing;
  end if;
  insert into event_signups (gym_id, event_id, user_id, paid) values (v_gym, p_event, v_uid, true) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.join_free_event(uuid) to authenticated;

-- ---------------------------------------------------------------- payments
-- Elke betaalrij wordt door de Stripe-webhook of door het beheer geschreven, altijd met de
-- service-role. Een lid heeft hier niets te zoeken: zelf een betaling verzinnen zette het
-- boekhoud-dashboard en de openstaande-saldo's op het verkeerde been.
revoke insert, update, delete on public.payments from anon, authenticated;
