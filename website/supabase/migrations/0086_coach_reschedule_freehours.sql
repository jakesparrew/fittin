-- 0086_coach_reschedule_freehours.sql
--  1) reschedule_booking: allow the COACH of a session to move it too (not only the booking owner).
--     6h-before rule, opening hours, overlap and slot-block checks all stay (recreated from 0079).
--  2) coach_free_hours(date): the free 1h start-times for a coach's gym on a date — powers the
--     availability-aware time dropdowns (so taken/blocked slots are no longer offered).

create or replace function public.reschedule_booking(p_booking uuid, p_date date, p_hour numeric)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_b bookings%rowtype;
  v_open int; v_close int;
  v_hours int;
  v_start timestamptz; v_end timestamptz;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  -- The booking owner (member) OR the coach assigned to the session may reschedule it.
  select * into v_b from bookings where id = p_booking and (user_id = v_uid or coach_id = v_uid) and status = 'bevestigd';
  if v_b.id is null then raise exception 'Boeking niet gevonden.' using errcode='P0001'; end if;
  if now() > v_b.starts_at - interval '6 hours' then
    raise exception 'Verplaatsen kan tot 6 uur voor de sessie.' using errcode='P0001';
  end if;

  v_hours := greatest(1, round(extract(epoch from (v_b.ends_at - v_b.starts_at)) / 3600.0)::int);
  select open_hour, close_hour into v_open, v_close from gyms where id = v_b.gym_id;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_hours > v_close then raise exception 'De duur valt buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(hours => v_hours);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

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
end; $$;
grant execute on function public.reschedule_booking(uuid, date, numeric) to authenticated;

-- Free 1h start-times (half-hour grid) for the caller's gym on a date — excludes overlaps with
-- confirmed bookings and slot blocks, and any slot already in the past.
create or replace function public.coach_free_hours(p_date date)
returns numeric[] language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_gym uuid; v_open int; v_close int;
  v_h numeric; v_start timestamptz; v_end timestamptz; v_free numeric[] := '{}';
begin
  if v_uid is null then return v_free; end if;
  select gym_id into v_gym from profiles where id = v_uid;
  if v_gym is null then return v_free; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  v_h := v_open;
  while v_h + 1 <= v_close loop
    v_start := (p_date + make_interval(mins => round(v_h * 60)::int)) at time zone 'Europe/Brussels';
    v_end := v_start + interval '1 hour';
    if v_start >= now()
       and not exists (select 1 from bookings b where b.gym_id = v_gym and b.status = 'bevestigd'
                        and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_start, v_end))
       and not exists (select 1 from slot_blocks sb where sb.gym_id = v_gym
                        and tstzrange(sb.starts_at, sb.ends_at) && tstzrange(v_start, v_end))
    then
      v_free := array_append(v_free, v_h);
    end if;
    v_h := v_h + 0.5;
  end loop;
  return v_free;
end; $$;
grant execute on function public.coach_free_hours(date) to authenticated;
