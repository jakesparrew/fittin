-- 0145_c-paginas.sql (oorspronkelijk 0141 — 0141 t/m 0144 waren intussen door andere migraties bezet)
-- NIET automatisch toegepast — de eigenaar draait dit bestand zelf tegen productie.
--
-- Waarom: "Boek tot 8 weken vooruit (zonder abo: 2)" staat als betaald voordeel op /lidmaatschap,
-- in de welkomstmail voor members en op /account, maar bestond alleen in de browser
-- (components/booking/BookingClient.jsx: `const maxWeek = isMember ? 7 : 1;`). De databank legde
-- geen enkele horizon op: een lid zonder abonnement kon via de RPC gewoon maanden vooruit boeken.
-- Vastgesteld op de testrekening coach@fittin.be (geen actief abonnement) met een boeking 70 dagen
-- vooruit, binnen een transactie die daarna is teruggedraaid.
--
-- Wat dit doet: dezelfde grens die de UI toont, ook in create_booking én reschedule_booking
-- (verplaatsen was anders de achterdeur naar dezelfde verre datum). Geen enkele bestaande rij
-- wordt aangeraakt.
--
-- De getallen: BookingClient toont per week-offset 7 dagen vanaf vandaag, dus offset 7 (member)
-- reikt tot vandaag + 55 dagen en offset 1 (zonder abo) tot vandaag + 13. 56 en 14 dagen dekken dat
-- precies, met één dag speling — de server mag nooit weigeren wat het scherm aanbiedt.

-- =====================================================================================
-- Helper: hoeveel dagen vooruit mag deze gebruiker boeken? null = geen grens.
-- =====================================================================================
-- Coaches en beheerders plannen ook sessies ver vooruit (blokkeringen, events, klantenreeksen);
-- de horizon is een ledenvoordeel, geen agendabeperking voor het huis.
create or replace function public.booking_horizon_days(p_user uuid)
returns int
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
           when (select role from profiles where id = p_user) in ('coach', 'beheerder') then null
           when public.has_active_membership(p_user) then 56
           else 14
         end;
$$;

-- LET OP — dezelfde val als in 0142: `revoke ... from public` haalt de standaardgrants die Supabase
-- expliciet aan anon EN authenticated uitdeelt NIET weg. Per rol intrekken dus, anders houdt anon
-- EXECUTE op een security-definer-functie die profiles leest — en verklapt POST /rest/v1/rpc/
-- booking_horizon_days met alleen de publieke sleutel of iemand een lopend abonnement heeft.
revoke all on function public.booking_horizon_days(uuid) from public;
revoke execute on function public.booking_horizon_days(uuid) from anon, authenticated;
grant execute on function public.booking_horizon_days(uuid) to authenticated, service_role;

-- =====================================================================================
-- create_booking — identiek aan de draaiende versie (0139), op de horizoncontrole na.
-- =====================================================================================
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
  v_horizon int;
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

  -- ⬇ NIEUW IN 0145: de boekhorizon die we als abo-voordeel verkopen, ook echt afdwingen.
  v_member := has_active_membership(v_uid);
  v_horizon := public.booking_horizon_days(v_uid);
  if v_horizon is not null
     and (v_start at time zone 'Europe/Brussels')::date > ((now() at time zone 'Europe/Brussels')::date + v_horizon) then
    if v_member then
      raise exception 'Je kan tot 8 weken vooruit boeken.' using errcode='P0001';
    else
      raise exception 'Zonder abonnement boek je tot 2 weken vooruit. Met een abonnement kan het tot 8 weken.' using errcode='P0001';
    end if;
  end if;

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
  v_factor := 1; -- no multi-hour discount

  if v_free then
    v_price := 0; v_source := 'gratis_code';
  elsif p_use_credit then
    -- 0139: serialiseer per lid, zodat lezen-en-afboeken van het tegoed één geheel is.
    perform pg_advisory_xact_lock(hashtext('credits:' || v_uid::text));
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

-- =====================================================================================
-- reschedule_booking — zelfde grens, anders is verplaatsen de achterdeur.
-- =====================================================================================
-- Zonder deze regel boekt iemand zonder abonnement binnen twee weken en schuift hij de sessie
-- daarna naar een datum drie maanden verderop; het voordeel zou dan nog steeds niets betekenen.
create or replace function public.reschedule_booking(p_booking uuid, p_date date, p_hour numeric)
 returns timestamptz
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
  v_horizon int;
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

  -- ⬇ NIEUW IN 0145: dezelfde boekhorizon als bij een nieuwe boeking (op wie verplaatst).
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
