-- 0118 — Naloop-audit van 0117 (halve uren): drie gevonden gaten gedicht.
--
-- 1) admin_adjust_credits nam enkel gehele getallen — na een 1,5-beurt-boeking kan een
--    beheerder-correctie van ±0,5 nodig zijn. p_delta → numeric (stappen van 0,5).
-- 2) coach_book_session: voor een ANONIEME sessie is auth.uid() null → v_role null →
--    "v_role not in (...)" evalueert naar NULL en de rol-guard vuurde nooit. De functie
--    stierf verderop veilig ('Onbekende sessie' door null-gym), maar een expliciete
--    null-check hoort vooraan (defense-in-depth; security definer omzeilt RLS).
-- 3) create_booking heeft die expliciete null-check al — ongewijzigd.

-- ---------- 1. admin_adjust_credits: halve beurten ----------
drop function if exists public.admin_adjust_credits(uuid, integer, text);

create or replace function public.admin_adjust_credits(p_member uuid, p_delta numeric, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_gym uuid;
begin
  if not is_beheerder() then raise exception 'Alleen beheerder.' using errcode='P0001'; end if;
  if p_delta is null or p_delta = 0 or p_delta * 2 <> round(p_delta * 2) then
    raise exception 'Geef een aantal in stappen van 0,5 (bv. 1, -2, 0,5).' using errcode='P0001';
  end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  if not exists (select 1 from profiles where id = p_member and gym_id = v_gym) then
    raise exception 'Lid niet gevonden.' using errcode='P0001';
  end if;
  insert into credits_ledger (gym_id, user_id, delta, reason)
  values (v_gym, p_member, p_delta, coalesce(p_reason, 'correctie'));
end; $function$;
grant execute on function public.admin_adjust_credits(uuid, numeric, text) to authenticated;

-- ---------- 2. coach_book_session: expliciete anon-guard ----------
create or replace function public.coach_book_session(p_client uuid, p_service uuid, p_date date, p_hour numeric, p_persons integer default 1, p_use_client_credit boolean default false, p_hours numeric default 1)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_coach uuid := auth.uid();
  v_gym uuid; v_role user_role; v_mode text; v_price int;
  v_srv services%rowtype; v_open int; v_close int;
  v_user uuid; v_start timestamptz; v_end timestamptz; v_id uuid; v_bal int; v_billing text; v_charge int; v_cbal int;
  v_lbal numeric;
  v_hours numeric := coalesce(p_hours, 1);
begin
  if v_coach is null then raise exception 'Alleen coaches kunnen dit.' using errcode='P0001'; end if;
  select gym_id, role, coach_billing_mode, coach_session_price_cents
    into v_gym, v_role, v_mode, v_price from profiles where id = v_coach;
  if v_role is null or v_role not in ('coach', 'beheerder') then raise exception 'Alleen coaches kunnen dit.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  if v_hours * 2 <> round(v_hours * 2) or v_hours < 1 or v_hours > 4 then
    raise exception 'Ongeldige duur.' using errcode='P0001';
  end if;

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
  if p_hour + v_hours > v_close then raise exception 'De gekozen duur valt buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => round(v_hours * 60)::int);
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
    -- Boeken vereist voldoende tegoed voor de gekozen duur (0115/0117); lock tegen dubbel-boek-race.
    perform pg_advisory_xact_lock(hashtext('coach_ledger:' || v_coach::text));
    select coalesce(sum(delta), 0) into v_lbal from coach_ledger where coach_id = v_coach;
    if v_lbal < v_hours then
      raise exception 'Onvoldoende sessietegoed (saldo: %, nodig: %). Koop eerst tegoed bij — een aankoop zuivert ook een openstaand saldo aan, daarna kan je weer boeken.', v_lbal, v_hours using errcode='P0001';
    end if;
    v_billing := 'credit'; v_charge := 0;
  else
    -- Maandfactuur: nooit € 0 (0116) — en naar rato van de duur.
    v_billing := 'invoice'; v_charge := round(coalesce(nullif(v_price, 0), 1200) * v_hours);
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid, coach_billing, coach_charge_cents)
    values (v_gym, v_srv.id, v_user, v_coach, v_start, v_end, p_persons, 'los', 0, true, v_billing, v_charge)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if v_billing = 'credit' then
    insert into coach_ledger (gym_id, coach_id, delta, reason, ref_id) values (v_gym, v_coach, -v_hours, 'sessie', v_id);
  end if;
  if p_client is not null and p_use_client_credit then
    -- Beurten die de client bij de coach prepaid heeft, tellen per sessie (onderlinge afspraak), niet per uur.
    insert into coach_credit_ledger (gym_id, coach_id, client_id, delta, reason, ref_id) values (v_gym, v_coach, p_client, -1, 'sessie', v_id);
  end if;
  return v_id;
end; $function$;
