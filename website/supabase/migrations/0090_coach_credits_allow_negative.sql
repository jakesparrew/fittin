-- 0090_coach_credits_allow_negative.sql
-- Coaches in 'credit' billing mode may now book even with 0 or negative session-credit balance.
-- The balance simply goes negative (an outstanding/owed amount) and the coach refills it afterwards.
-- Recreated verbatim from 0087 except the credit branch no longer raises on insufficient balance.
create or replace function public.coach_book_session(
  p_client uuid, p_service uuid, p_date date, p_hour numeric, p_persons int default 1, p_use_client_credit boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_gym uuid; v_role user_role; v_mode text; v_price int;
  v_srv services%rowtype; v_open int; v_close int;
  v_user uuid; v_start timestamptz; v_end timestamptz; v_id uuid; v_bal int; v_billing text; v_charge int; v_cbal int;
begin
  select gym_id, role, coach_billing_mode, coach_session_price_cents
    into v_gym, v_role, v_mode, v_price from profiles where id = v_coach;
  if v_role not in ('coach', 'beheerder') then raise exception 'Alleen coaches kunnen dit.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;

  -- p_client null = reserve the slot for the coach (no client yet); assign one afterwards.
  if p_client is not null then
    if not exists (select 1 from profiles where id = p_client and gym_id = v_gym) then
      raise exception 'Onbekende client.' using errcode='P0001'; end if;
    if v_role = 'coach' and not exists (
      select 1 from coach_clients where coach_id = v_coach and client_id = p_client and gym_id = v_gym and status = 'accepted'
    ) then raise exception 'Dit is niet jouw (verbonden) client.' using errcode='P0001'; end if;
  end if;
  v_user := coalesce(p_client, v_coach);

  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;
  if exists (select 1 from slot_blocks sb where sb.gym_id = v_gym
              and tstzrange(sb.starts_at, sb.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is geblokkeerd.' using errcode='P0001';
  end if;

  if p_client is not null and p_use_client_credit then
    select coalesce(sum(delta), 0) into v_cbal from coach_credit_ledger where coach_id = v_coach and client_id = p_client;
    if v_cbal < 1 then raise exception 'Deze client heeft geen sessietegoed bij jou.' using errcode='P0001'; end if;
  end if;

  if v_mode = 'free' then
    v_billing := 'free'; v_charge := 0;
  elsif v_mode = 'credit' then
    -- Saldo mag negatief gaan: de coach kan blijven boeken en vult zijn sessietegoed achteraf aan.
    v_billing := 'credit'; v_charge := 0;
  else
    v_billing := 'invoice'; v_charge := coalesce(v_price, 0);
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid, coach_billing, coach_charge_cents)
    values (v_gym, v_srv.id, v_user, v_coach, v_start, v_end, p_persons, 'los', 0, true, v_billing, v_charge)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if v_billing = 'credit' then
    insert into coach_ledger (gym_id, coach_id, delta, reason, ref_id) values (v_gym, v_coach, -1, 'sessie', v_id);
  end if;
  if p_client is not null and p_use_client_credit then
    insert into coach_credit_ledger (gym_id, coach_id, client_id, delta, reason, ref_id) values (v_gym, v_coach, p_client, -1, 'sessie', v_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.coach_book_session(uuid, uuid, date, numeric, int, boolean) to authenticated;
