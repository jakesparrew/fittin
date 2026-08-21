-- Coach mag verplaatsen tot 1 uur vóór de sessie; een lid houdt 6 uur.
--
-- WAAROM: een client die 's ochtends afbelt voor een sessie van 14:00 laat de coach vandaag met
-- lege handen achter. reschedule_booking hanteerde één harde grens van 6 uur voor iedereen, en de
-- knoppen in de coach-UI verdwenen op datzelfde moment — vandaar dat het aanvoelde alsof een datum
-- helemaal niet te wijzigen was. Voor een lid is 6 uur bewust: het uur komt dan nog op tijd vrij
-- voor iemand anders. Een coach plant zijn eigen agenda en weet wat er in de zaal staat, dus daar
-- is de zaalbezetting de enige echte grens.
--
-- Wie 'coach' is bepaalt is_staff() (rol coach of beheerder) — hetzelfde slot dat de rest van de
-- app gebruikt. Wie mag verplaatsen verandert NIET: de rijfilter hieronder blijft
-- (user_id = v_uid or coach_id = v_uid), dus een coach raakt alleen zijn eigen sessies aan.
--
-- De zaalcontroles blijven ongewijzigd en zijn de echte grens: openingsuren, overlap met een andere
-- bevestigde boeking, geblokkeerde slots, en de exclusion-constraint als vangnet bij een race.

create or replace function public.reschedule_booking(p_booking uuid, p_date date, p_hour numeric)
returns timestamptz language plpgsql security definer set search_path = public as $function$
declare
  v_uid uuid := auth.uid();
  v_b bookings%rowtype;
  v_open int; v_close int;
  v_hours numeric;
  v_start timestamptz; v_end timestamptz;
  v_horizon int;
  v_venster interval;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  select * into v_b from bookings where id = p_booking and (user_id = v_uid or coach_id = v_uid) and status = 'bevestigd';
  if v_b.id is null then raise exception 'Boeking niet gevonden.' using errcode='P0001'; end if;

  -- ⬇ 0146: het venster hangt af van WIE verplaatst, niet van de boeking.
  v_venster := case when is_staff() then interval '1 hour' else interval '6 hours' end;
  if now() > v_b.starts_at - v_venster then
    raise exception 'Verplaatsen kan tot % uur voor de sessie.', extract(hour from v_venster)::int using errcode='P0001';
  end if;

  -- Duur op 30-min-precisie (round /3600 maakte van 90 min → 2 uur bij het verplaatsen).
  v_hours := greatest(0.5, round(extract(epoch from (v_b.ends_at - v_b.starts_at)) / 1800.0) / 2.0);
  select open_hour, close_hour into v_open, v_close from gyms where id = v_b.gym_id;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_hours > v_close then raise exception 'De duur valt buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => round(v_hours * 60)::int);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

  -- Dezelfde boekhorizon als bij een nieuwe boeking (0145). Personeel heeft er geen.
  v_horizon := public.booking_horizon_days(v_uid);
  if v_horizon is not null
     and (v_start at time zone 'Europe/Brussels')::date > ((now() at time zone 'Europe/Brussels')::date + v_horizon) then
    raise exception 'Je kan tot % weken vooruit plannen.', (v_horizon / 7) using errcode='P0001';
  end if;

  if exists (select 1 from bookings b where b.gym_id = v_b.gym_id and b.status = 'bevestigd' and b.id <> p_booking
              and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is al geboekt. Kies een ander moment.' using errcode='P0001';
  end if;
  if exists (select 1 from slot_blocks sb where sb.gym_id = v_b.gym_id
              and tstzrange(sb.starts_at, sb.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is geblokkeerd.' using errcode='P0001';
  end if;

  begin
    update bookings set starts_at = v_start, ends_at = v_end,
        reminder_sent = false, access_sent = false, nuki_code = null
      where id = p_booking;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is net geboekt. Kies een ander uur.' using errcode='P0001';
  end;
  return v_start;
end; $function$;

-- Vrije uren: nu op de ECHTE duur van de sessie, en zonder de boeking die je aan het verplaatsen bent.
--
-- Twee gaten die dit dicht: (1) de lijst toetste altijd op één uur, dus bij een sessie van 90 minuten
-- kon je een uur kiezen dat reschedule_booking daarna alsnog weigerde — de coach kreeg dan een
-- foutmelding op een uur dat de app zelf had voorgesteld; (2) de boeking die je verplaatst telde als
-- bezet, waardoor je hem niet naar een half uur vroeger of later op dezelfde dag kon schuiven.
--
-- Nieuwe parameters staan achteraan mét default, dus de bestaande aanroep coach_free_hours(p_date)
-- blijft werken.
create or replace function public.coach_free_hours(p_date date, p_hours numeric default 1, p_exclude uuid default null)
returns numeric[] language plpgsql security definer set search_path = public as $function$
declare
  v_uid uuid := auth.uid(); v_gym uuid; v_open int; v_close int;
  v_h numeric; v_start timestamptz; v_end timestamptz; v_free numeric[] := '{}';
  v_dur numeric := greatest(0.5, coalesce(p_hours, 1));
begin
  if v_uid is null then return v_free; end if;
  select gym_id into v_gym from profiles where id = v_uid;
  if v_gym is null then return v_free; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  v_h := v_open;
  while v_h + v_dur <= v_close loop
    v_start := (p_date + make_interval(mins => round(v_h * 60)::int)) at time zone 'Europe/Brussels';
    v_end := v_start + make_interval(mins => round(v_dur * 60)::int);
    if v_start >= now()
       and not exists (select 1 from bookings b where b.gym_id = v_gym and b.status = 'bevestigd'
                        and (p_exclude is null or b.id <> p_exclude)
                        and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_start, v_end))
       and not exists (select 1 from slot_blocks sb where sb.gym_id = v_gym
                        and tstzrange(sb.starts_at, sb.ends_at) && tstzrange(v_start, v_end))
    then
      v_free := array_append(v_free, v_h);
    end if;
    v_h := v_h + 0.5;
  end loop;
  return v_free;
end; $function$;

-- 🔑 Per rol intrekken: `revoke ... from public` haalt de standaardgrants die Supabase expliciet aan
-- anon én authenticated uitdeelt NIET weg. Beide functies horen alleen bij een ingelogde gebruiker.
revoke execute on function public.reschedule_booking(uuid, date, numeric) from anon, authenticated;
grant  execute on function public.reschedule_booking(uuid, date, numeric) to authenticated, service_role;
revoke execute on function public.coach_free_hours(date) from anon, authenticated;
revoke execute on function public.coach_free_hours(date, numeric, uuid) from anon, authenticated;
grant  execute on function public.coach_free_hours(date, numeric, uuid) to authenticated, service_role;
