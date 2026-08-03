-- 0117 — 90-minutensessies: halve uren door de hele geldkern (owner-vraag 2026-08-01).
--
-- 1,5 uur = 1,5× de prijs (los € 22,50 · abo € 18) of 1,5 beurt van de kaart; coaches betalen
-- 1,5 sessietegoed. Daarvoor moeten de ledgers halve eenheden kunnen bewaren (int → numeric)
-- en rekenen alle balans-/boekfuncties voortaan in halve uren. Verplaatsen behoudt de duur.
--
-- Bestaande data: alle huidige deltas zijn gehele getallen — de type-verbreding verandert
-- geen enkel saldo. Return-types wijzigen ⇒ drop + recreate (met dezelfde grants/RLS-context).

-- ---------- 1. Ledgers: halve beurten mogelijk ----------
-- member_engagement (activatie-segmenten) leest credits_ledger.delta → tijdelijk droppen en
-- na de type-wijziging identiek terugzetten (enkel de 0-coalesce wordt numeric i.p.v. bigint).
drop view if exists member_engagement;

alter table credits_ledger alter column delta type numeric(6,1) using delta::numeric;
alter table coach_ledger  alter column delta type numeric(6,1) using delta::numeric;

create view member_engagement as
 with attendance as (
         select b.user_id, b.starts_at
           from bookings b
          where b.status = 'bevestigd'::booking_status
        union all
         select bp.user_id, b.starts_at
           from booking_participants bp
             join bookings b on b.id = bp.booking_id
          where b.status = 'bevestigd'::booking_status
        )
 select id as user_id,
    gym_id,
    full_name,
    email,
    ( select max(a.starts_at) from attendance a
          where a.user_id = p.id and a.starts_at <= now()) as last_visit,
    ( select count(*) from attendance a
          where a.user_id = p.id and a.starts_at >= date_trunc('month'::text, now()) and a.starts_at <= now()) as visits_this_month,
    ( select count(*) from attendance a
          where a.user_id = p.id and a.starts_at <= now()) as visits_total,
    coalesce(( select sum(cl.delta) from credits_ledger cl
          where cl.user_id = p.id), 0::numeric) as credits,
    ( select count(*) from memberships m
          where m.user_id = p.id and m.status = 'actief'::text) as active_memberships,
    ( select count(*) from memberships m
          where m.user_id = p.id) as ever_memberships
   from profiles p
  where role = 'lid'::user_role;

-- ---------- 2. Balansfuncties → numeric ----------
drop function if exists gym_credit_balances(uuid);
drop function if exists credits_balance(uuid);
drop function if exists credits_balance_detail(uuid);
drop function if exists coach_credit_balance(uuid);

create or replace function public.credits_balance(p_user uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_used numeric := 0;
  v_avail numeric := 0;
  r record;
begin
  if p_user is null then return 0; end if;
  if auth.uid() is not null and p_user <> auth.uid() and not is_beheerder() then
    raise exception 'Geen toegang.' using errcode='P0001';
  end if;
  select coalesce(-sum(delta), 0) into v_used
    from credits_ledger where user_id = p_user and delta < 0;
  -- FIFO: oudste grants eerst opgebruiken; wat overblijft telt enkel als het niet vervallen is.
  for r in
    select delta, expires_at from credits_ledger
    where user_id = p_user and delta > 0
    order by created_at asc, id asc
  loop
    if v_used >= r.delta then
      v_used := v_used - r.delta;
    else
      if r.expires_at is null or r.expires_at > now() then
        v_avail := v_avail + (r.delta - v_used);
      end if;
      v_used := 0;
    end if;
  end loop;
  -- Halve-beurt-precisie (geen floor meer — die at de 0,5 op).
  return greatest(0, round(v_avail * 2) / 2.0);
end; $$;
grant execute on function public.credits_balance(uuid) to authenticated;

create or replace function public.gym_credit_balances(p_gym uuid)
returns table(user_id uuid, balance numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_beheerder() then raise exception 'Alleen beheerder.' using errcode='P0001'; end if;
  return query
    select p.id, public.credits_balance(p.id)
    from profiles p
    where p.gym_id = p_gym;
end; $$;
grant execute on function public.gym_credit_balances(uuid) to authenticated;

create or replace function public.credits_balance_detail(p_user uuid)
returns table(balance numeric, next_expiry timestamptz, expiring numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_used numeric := 0;
  v_avail numeric := 0;
  v_next timestamptz := null;
  v_next_amt numeric := 0;
  r record;
  v_left numeric;
begin
  if p_user is null then return query select 0::numeric, null::timestamptz, 0::numeric; return; end if;
  if auth.uid() is not null and p_user <> auth.uid() and not is_beheerder() then
    raise exception 'Geen toegang.' using errcode='P0001';
  end if;
  select coalesce(-sum(delta), 0) into v_used from credits_ledger where user_id = p_user and delta < 0;
  for r in
    select delta, expires_at from credits_ledger
    where user_id = p_user and delta > 0
    order by created_at asc, id asc
  loop
    if v_used >= r.delta then
      v_used := v_used - r.delta;
    else
      v_left := r.delta - v_used;
      v_used := 0;
      if r.expires_at is null or r.expires_at > now() then
        v_avail := v_avail + v_left;
        if r.expires_at is not null and (v_next is null or r.expires_at < v_next) then
          v_next := r.expires_at;
        end if;
      end if;
    end if;
  end loop;
  if v_next is not null then
    v_used := (select coalesce(-sum(delta), 0) from credits_ledger where user_id = p_user and delta < 0);
    for r in
      select delta, expires_at from credits_ledger
      where user_id = p_user and delta > 0
      order by created_at asc, id asc
    loop
      if v_used >= r.delta then v_used := v_used - r.delta;
      else
        v_left := r.delta - v_used; v_used := 0;
        if r.expires_at = v_next then v_next_amt := v_next_amt + v_left; end if;
      end if;
    end loop;
  end if;
  return query select greatest(0, round(v_avail * 2) / 2.0), v_next, greatest(0, round(v_next_amt * 2) / 2.0);
end; $$;
grant execute on function public.credits_balance_detail(uuid) to authenticated;

create or replace function public.coach_credit_balance(p_coach uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::numeric from coach_ledger where coach_id = p_coach;
$$;
grant execute on function public.coach_credit_balance(uuid) to authenticated;

-- ---------- 3. create_booking: p_hours in halve uren ----------
drop function if exists public.create_booking(uuid, date, numeric, integer, boolean, uuid, boolean, integer);

create or replace function public.create_booking(p_service uuid, p_date date, p_hour numeric, p_persons integer default 1, p_use_welcome boolean default false, p_coach uuid default null::uuid, p_use_credit boolean default false, p_hours numeric default 1)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_gym uuid; v_used boolean; v_srv services%rowtype;
  v_open int; v_close int; v_start timestamptz; v_end timestamptz;
  v_free boolean; v_price int; v_base int; v_factor numeric; v_source payment_source; v_id uuid; v_bal numeric; v_member boolean;
  v_hours numeric := coalesce(p_hours, 1);
  v_pt_price int;
  v_pt1 int;
  v_wstatus text;
  v_role text;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn om te boeken.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  -- Duur in stappen van 30 min, tussen 1u en 4u (1 · 1,5 · 2 · … · 4).
  if v_hours * 2 <> round(v_hours * 2) or v_hours < 1 or v_hours > 4 then
    raise exception 'Ongeldige duur.' using errcode='P0001';
  end if;
  select gym_id, welcome_code_used, welcome_status, role into v_gym, v_used, v_wstatus, v_role from profiles where id = v_uid;
  if v_gym is null then raise exception 'Geen profiel gevonden.' using errcode='P0001'; end if;
  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_hours > v_close then raise exception 'De gekozen duur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => round(v_hours * 60)::int);
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
  -- Staff-tarief (0114): coach/beheerder betaalt het member-tarief, ook via de publieke pagina.
  elsif v_role in ('coach', 'beheerder') and v_srv.type <> 'pt' and v_srv.member_price_cents is not null then
    v_base := v_srv.member_price_cents; v_price := round(v_base * v_hours * v_factor); v_source := 'los';
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
end; $function$;
grant execute on function public.create_booking(uuid, date, numeric, integer, boolean, uuid, boolean, numeric) to authenticated;

-- ---------- 4. coach_book_session: duur in halve uren, tegoed naar rato ----------
drop function if exists public.coach_book_session(uuid, uuid, date, numeric, integer, boolean);

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
  select gym_id, role, coach_billing_mode, coach_session_price_cents
    into v_gym, v_role, v_mode, v_price from profiles where id = v_coach;
  if v_role not in ('coach', 'beheerder') then raise exception 'Alleen coaches kunnen dit.' using errcode='P0001'; end if;
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
grant execute on function public.coach_book_session(uuid, uuid, date, numeric, integer, boolean, numeric) to authenticated;

-- ---------- 5. Refund-triggers: halve-uur-precisie ----------
create or replace function public.refund_member_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hours numeric;
begin
  if new.status = 'geannuleerd' and old.status <> 'geannuleerd' and new.payment_source = 'credit' then
    if not exists (select 1 from credits_ledger where ref_id = new.id and reason = 'refund') then
      v_hours := greatest(0.5, round(extract(epoch from (new.ends_at - new.starts_at)) / 1800.0) / 2.0);
      insert into credits_ledger (gym_id, user_id, delta, reason, ref_id)
      values (new.gym_id, new.user_id, v_hours, 'refund', new.id);
    end if;
  end if;
  return new;
end; $$;

create or replace function public.refund_coach_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hours numeric;
begin
  if new.status = 'geannuleerd' and old.status <> 'geannuleerd'
     and new.coach_billing = 'credit' and new.coach_id is not null then
    if not exists (select 1 from coach_ledger where ref_id = new.id and reason = 'annulatie') then
      v_hours := greatest(0.5, round(extract(epoch from (new.ends_at - new.starts_at)) / 1800.0) / 2.0);
      insert into coach_ledger (gym_id, coach_id, delta, reason, ref_id)
      values (new.gym_id, new.coach_id, v_hours, 'annulatie', new.id);
    end if;
  end if;
  return new;
end; $$;

-- ---------- 6. reschedule_booking: behoudt de (halve-uur-)duur ----------
create or replace function public.reschedule_booking(p_booking uuid, p_date date, p_hour numeric)
 returns timestamp with time zone
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_b bookings%rowtype;
  v_open int; v_close int;
  v_hours numeric;
  v_start timestamptz; v_end timestamptz;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  select * into v_b from bookings where id = p_booking and (user_id = v_uid or coach_id = v_uid) and status = 'bevestigd';
  if v_b.id is null then raise exception 'Boeking niet gevonden.' using errcode='P0001'; end if;
  if now() > v_b.starts_at - interval '6 hours' then
    raise exception 'Verplaatsen kan tot 6 uur voor de sessie.' using errcode='P0001';
  end if;

  -- Duur op 30-min-precisie (round /3600 maakte van 90 min → 2 uur bij het verplaatsen).
  v_hours := greatest(0.5, round(extract(epoch from (v_b.ends_at - v_b.starts_at)) / 1800.0) / 2.0);
  select open_hour, close_hour into v_open, v_close from gyms where id = v_b.gym_id;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_hours > v_close then raise exception 'De duur valt buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => round(v_hours * 60)::int);
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
end; $function$;
