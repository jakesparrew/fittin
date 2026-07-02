-- 0095_credit_balance_fifo.sql
-- FIX (critical): member credit balance was computed as
--   sum(delta) where (expires_at is null or expires_at > now())
-- Positive grants carry an expires_at (punch card = +6 months, abo session = end of month) but the
-- negative 'gebruik' rows (and 'refund'/adjustment rows) are inserted with expires_at = NULL, so they
-- never drop out. Result: once a grant EXPIRES, its consuming -1 lingers forever and eats the NEXT
-- grant. Concretely: an abo member who used June's included session sits at -1 in July, so July's
-- renewal grant nets to 0; a second €150 punch card shows fewer sessions than bought.
--
-- Fix WITHOUT mutating any data or backfilling: compute the balance with proper FIFO accounting at
-- read time. Total usage consumes the oldest positive grants first; the remaining balance is whatever
-- is left on grants that have NOT expired. A used-then-expired grant contributes 0 (it was consumed);
-- an unused-then-expired grant contributes 0 (it expired) — neither leaks a dangling negative.

create or replace function public.credits_balance(p_user uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_used numeric := 0;   -- total consumed (absolute value of all negative rows)
  v_avail numeric := 0;  -- remaining, non-expired
  r record;
begin
  if p_user is null then return 0; end if;
  -- A member may read only their own balance; staff any; the service role (auth.uid() null) bypasses.
  if auth.uid() is not null and p_user <> auth.uid() and not is_beheerder() then
    raise exception 'Geen toegang.' using errcode='P0001';
  end if;
  select coalesce(-sum(delta), 0) into v_used
    from credits_ledger where user_id = p_user and delta < 0;
  -- Walk positive grants oldest-first, letting usage consume them FIFO.
  for r in
    select delta, expires_at
    from credits_ledger
    where user_id = p_user and delta > 0
    order by created_at asc, id asc
  loop
    if v_used >= r.delta then
      v_used := v_used - r.delta;                 -- grant fully consumed
    else
      -- part of this grant survives usage; count it only if it has not expired
      if r.expires_at is null or r.expires_at > now() then
        v_avail := v_avail + (r.delta - v_used);
      end if;
      v_used := 0;
    end if;
  end loop;
  return greatest(0, floor(v_avail))::int;
end;
$$;
grant execute on function public.credits_balance(uuid) to authenticated;

-- Batch variant for the admin members list (avoids N calls). Beheerder-only.
create or replace function public.gym_credit_balances(p_gym uuid)
returns table(user_id uuid, balance int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_beheerder() then raise exception 'Alleen beheerder.' using errcode='P0001'; end if;
  return query
    select p.id, public.credits_balance(p.id)
    from profiles p
    where p.gym_id = p_gym;
end;
$$;
grant execute on function public.gym_credit_balances(uuid) to authenticated;

-- ---- Point the two booking RPCs at the correct balance (was the buggy inline sum) ----

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
    v_bal := public.credits_balance(v_uid);
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
    v_price := round(v_base * p_persons * v_hours * v_factor);
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

create or replace function public.admin_create_booking(
  p_member uuid, p_service uuid, p_date date, p_hour numeric, p_persons int default 1, p_use_credit boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid; v_srv services%rowtype; v_start timestamptz; v_end timestamptz; v_id uuid; v_bal int; v_source payment_source;
begin
  if not is_beheerder() then raise exception 'Alleen beheerder.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  if not exists (select 1 from profiles where id = p_member and gym_id = v_gym) then
    raise exception 'Lid niet gevonden.' using errcode='P0001';
  end if;
  select * into v_srv from services where id = p_service and gym_id = v_gym;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;
  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);
  if exists (select 1 from slot_blocks sb where sb.gym_id = v_gym
              and tstzrange(sb.starts_at, sb.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is geblokkeerd.' using errcode='P0001';
  end if;

  if p_use_credit then
    v_bal := public.credits_balance(p_member);
    if v_bal < 1 then raise exception 'Dit lid heeft onvoldoende sessies.' using errcode='P0001'; end if;
    v_source := 'credit';
  else
    v_source := 'los';  -- admin comp (free)
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, starts_at, ends_at, persons, payment_source, price_cents, paid)
    values (v_gym, v_srv.id, p_member, v_start, v_end, p_persons, v_source, 0, true)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if p_use_credit then
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id) values (v_gym, p_member, -1, 'gebruik', v_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_create_booking(uuid, uuid, date, numeric, int, boolean) to authenticated;
