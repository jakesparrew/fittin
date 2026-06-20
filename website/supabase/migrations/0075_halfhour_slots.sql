-- 0075_halfhour_slots.sql
-- Half-hour booking grid: a booking can START every 30 min (06:00, 06:30, 07:00, …) while the
-- minimum (and step) of the DURATION stays whole hours, min 1h — so 1 credit still = 1 hour.
-- The slot start is represented as a decimal "hour" (6.5 = 06:30). Opening hours (gyms.open_hour /
-- close_hour) stay whole integers; all existing arithmetic keeps working with the decimal start.
-- Overlap safety is unchanged: the generic tstzrange GIST exclusion constraint (0055) already
-- protects against ANY overlapping confirmed bookings at minute precision — no change needed there.

-- ---- create_booking: accept a half-hour-aligned decimal start hour ----
drop function if exists public.create_booking(uuid, date, int, int, boolean, uuid, boolean, int);
create or replace function public.create_booking(
  p_service uuid, p_date date, p_hour numeric, p_persons int default 1,
  p_use_welcome boolean default false, p_coach uuid default null,
  p_use_credit boolean default false, p_hours int default 1
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid; v_used boolean; v_srv services%rowtype;
  v_open int; v_close int; v_start timestamptz; v_end timestamptz;
  v_free boolean; v_price int; v_base int; v_factor numeric; v_source payment_source; v_id uuid; v_bal int; v_member boolean;
  v_hours int := greatest(1, least(4, coalesce(p_hours, 1)));
  v_pt_price int;
  v_pt1 int;
  v_wstatus text;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn om te boeken.' using errcode='P0001'; end if;
  -- Start must land on a half-hour boundary (…:00 or …:30).
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  select gym_id, welcome_code_used, welcome_status into v_gym, v_used, v_wstatus from profiles where id = v_uid;
  if v_gym is null then raise exception 'Geen profiel gevonden.' using errcode='P0001'; end if;
  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_hours > v_close then raise exception 'De gekozen duur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(hours => v_hours);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

  if exists (select 1 from bookings b where b.gym_id = v_gym and b.status = 'bevestigd'
              and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is (deels) al geboekt. Kies een ander moment.' using errcode='P0001';
  end if;
  if exists (select 1 from slot_blocks sb where sb.gym_id = v_gym
              and tstzrange(sb.starts_at, sb.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is geblokkeerd.' using errcode='P0001';
  end if;

  v_free := p_use_welcome and not coalesce(v_used, false) and v_wstatus = 'eligible'
            and v_srv.type = 'fit60' and v_hours = 1;
  v_member := has_active_membership(v_uid);
  v_factor := 1; -- no multi-hour discount

  if v_free then
    v_price := 0; v_source := 'gratis_code';
  elsif p_use_credit then
    select coalesce(sum(delta), 0) into v_bal from credits_ledger
      where user_id = v_uid and (expires_at is null or expires_at > now());
    if v_bal < v_hours then raise exception 'Onvoldoende sessies voor deze duur.' using errcode='P0001'; end if;
    v_price := 0; v_source := 'credit';
  elsif v_member and v_srv.member_price_cents is not null then
    v_base := v_srv.member_price_cents; v_price := round(v_base * v_hours * v_factor); v_source := 'abo';
  elsif v_srv.type = 'pt' and p_coach is not null then
    select coach_pt_price_cents,
           case when p_persons >= 3 then coach_pt3_price_cents
                when p_persons = 2 then coach_pt2_price_cents
                else coach_pt_price_cents end
      into v_pt1, v_pt_price from profiles where id = p_coach;
    v_base := coalesce(v_pt_price, v_pt1, v_srv.price_cents);
    v_price := round(v_base * p_persons * v_hours * v_factor); -- per persoon × personen × uren
    v_source := 'los';
  else
    v_base := v_srv.price_cents; v_price := round(v_base * v_hours * v_factor); v_source := 'los';
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid)
    values (v_gym, v_srv.id, v_uid, p_coach, v_start, v_end, p_persons, v_source, v_price, v_free or p_use_credit)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is net geboekt. Kies een ander uur.' using errcode='P0001';
  end;

  if v_free then update profiles set welcome_code_used = true where id = v_uid; end if;
  if v_source = 'credit' then
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id) values (v_gym, v_uid, -v_hours, 'gebruik', v_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.create_booking(uuid, date, numeric, int, boolean, uuid, boolean, int) to authenticated;

-- ---- reschedule_booking: same half-hour-aligned decimal start ----
drop function if exists public.reschedule_booking(uuid, date, int);
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
  select * into v_b from bookings where id = p_booking and user_id = v_uid and status = 'bevestigd';
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
    update bookings set starts_at = v_start, ends_at = v_end, reminder_sent = false, access_sent = false
      where id = p_booking;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is net geboekt. Kies een ander uur.' using errcode='P0001';
  end;
  return v_start;
end; $$;
grant execute on function public.reschedule_booking(uuid, date, numeric) to authenticated;

-- ---- gym_taken_slots: expand bookings AND blocks per 30 minutes so the UI greys out every
--      occupied half-hour cell (a 06:30–07:30 booking now blocks 06:30 and 07:00). ----
create or replace function public.gym_taken_slots(p_gym uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select gs as starts_at
  from bookings b
  cross join lateral generate_series(b.starts_at, b.ends_at - interval '1 minute', interval '30 minutes') gs
  where b.gym_id = p_gym and b.status = 'bevestigd' and gs >= p_from and gs < p_to
  union
  select gs as starts_at
  from slot_blocks sb
  cross join lateral generate_series(sb.starts_at, sb.ends_at - interval '1 minute', interval '30 minutes') gs
  where sb.gym_id = p_gym and gs >= p_from and gs < p_to;
$$;
grant execute on function public.gym_taken_slots(uuid, timestamptz, timestamptz) to anon, authenticated;
