-- 0006: PT booking with a coach. create_booking gains optional p_coach; coaches set availability.

-- Public read of coach availability (members browse PT slots before booking).
drop policy if exists coach_avail_select on coach_availability;
create policy coach_avail_select on coach_availability for select using (true);

-- A coach can manage their OWN availability (besides staff managing all — already present).
drop policy if exists coach_avail_self on coach_availability;
create policy coach_avail_self on coach_availability for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and gym_id = current_gym_id());

-- Recreate create_booking with an optional coach.
drop function if exists public.create_booking(uuid, date, int, int, boolean);
create or replace function public.create_booking(
  p_service uuid,
  p_date    date,
  p_hour    int,
  p_persons int default 1,
  p_use_welcome boolean default false,
  p_coach   uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_gym     uuid;
  v_used    boolean;
  v_srv     services%rowtype;
  v_open    int;
  v_close   int;
  v_start   timestamptz;
  v_end     timestamptz;
  v_free    boolean;
  v_price   int;
  v_source  payment_source;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn om te boeken.' using errcode='P0001'; end if;
  select gym_id, welcome_code_used into v_gym, v_used from profiles where id = v_uid;
  if v_gym is null then raise exception 'Geen profiel gevonden.' using errcode='P0001'; end if;

  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;

  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then
    raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001';
  end if;
  if p_persons < 1 or p_persons > v_srv.capacity then
    raise exception 'Ongeldig aantal personen.' using errcode='P0001';
  end if;

  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

  v_free   := p_use_welcome and not coalesce(v_used, false) and v_srv.type = 'fit60';
  v_price  := case when v_free then 0 else v_srv.price_cents end;
  v_source := case when v_free then 'gratis_code'::payment_source else 'los'::payment_source end;

  begin
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid)
    values (v_gym, v_srv.id, v_uid, p_coach, v_start, v_end, p_persons, v_source, v_price, v_free)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dit tijdslot is net geboekt. Kies een ander uur.' using errcode='P0001';
  end;

  if v_free then update profiles set welcome_code_used = true where id = v_uid; end if;
  return v_id;
end; $$;
grant execute on function public.create_booking(uuid, date, int, int, boolean, uuid) to authenticated;
