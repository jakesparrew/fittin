-- 0025: admin booking can either comp the member (free, no charge — admin override) or deduct a
-- session credit. Either way no money is collected (price 0), so it never inflates revenue.
create or replace function public.admin_create_booking(
  p_member uuid, p_service uuid, p_date date, p_hour int, p_persons int default 1, p_use_credit boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid; v_srv services%rowtype; v_start timestamptz; v_end timestamptz; v_id uuid; v_bal int; v_source payment_source;
begin
  if not is_staff() then raise exception 'Geen rechten.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  if not exists (select 1 from profiles where id = p_member and gym_id = v_gym) then
    raise exception 'Lid niet gevonden.' using errcode='P0001';
  end if;
  select * into v_srv from services where id = p_service and gym_id = v_gym;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);

  if p_use_credit then
    select coalesce(sum(delta), 0) into v_bal from credits_ledger where user_id = p_member;
    if v_bal < 1 then raise exception 'Dit lid heeft onvoldoende sessies.' using errcode='P0001'; end if;
    v_source := 'credit';
  else
    v_source := 'los';  -- admin comp (free)
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, starts_at, ends_at, persons, payment_source, price_cents, paid)
    values (v_gym, v_srv.id, p_member, v_start, v_end, p_persons, v_source, 0, true)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if p_use_credit then
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id) values (v_gym, p_member, -1, 'gebruik', v_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_create_booking(uuid, uuid, date, int, int, boolean) to authenticated;
