-- 0139_hygiene.sql
-- Drie losse rechtzettingen uit de groei-audit (G1-8, G6-10, G6-11). Geen datamigratie: er wordt
-- geen enkele bestaande rij aangeraakt, enkel functies/views herschreven en één kolomrecht
-- uitgedeeld. NIET automatisch toegepast — de eigenaar draait dit bestand zelf tegen productie.

-- =====================================================================================
-- G1-8 — create_booking: advisory lock op het sessietegoed
-- =====================================================================================
-- admin_create_booking (0120) en coach_book_session (0117) nemen vóór hun saldolezing een
-- pg_advisory_xact_lock op de portemonnee in kwestie; create_booking — het pad dat leden zelf
-- gebruiken — deed dat niet. Twee gelijktijdige boekingen (twee tabbladen, een dubbele tik op een
-- trage verbinding) lezen dan allebei hetzelfde saldo, slagen allebei voor de controle, en boeken
-- samen meer beurten dan er zijn. De transactie eindigt op een negatief tegoed dat niemand ziet.
--
-- De lock is per lid en per transactie: hij vertraagt niets voor iemand anders en valt vanzelf weg
-- bij commit of rollback. Verder is de functie letterlijk identiek aan 0117 — bewust, zodat het
-- verschil in een diff één regel is.
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
    -- ⬇ DE WIJZIGING VAN 0139: serialiseer per lid, zodat lezen-en-afboeken één geheel is.
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
grant execute on function public.create_booking(uuid, date, numeric, integer, boolean, uuid, boolean, numeric) to authenticated;

-- =====================================================================================
-- G6-10 — kolomrecht voor de zichtbaarheidsschakelaar
-- =====================================================================================
-- Sinds 0015 heeft elke profiles-kolom die een lid zélf mag zetten een expliciete kolom-grant
-- nodig (full_name/phone daar, height_cm/goal_weight_kg in 0038, leaderboard_opt_in in 0067).
-- 0131 voegde training_visible_to_buddies toe maar vergat de grant. Gevolg: de privacyschakelaar
-- op /account kon nooit slagen en /api/me/duo gaf structureel een lege lijst — twee gebouwde
-- functies die stil niets deden.
grant update (training_visible_to_buddies) on public.profiles to authenticated;

-- =====================================================================================
-- G6-11 — member_engagement.credits telt vervallen beurten niet meer mee
-- =====================================================================================
-- De view somde credits_ledger.delta kaal op. Een lid met een verlopen 10-beurtenkaart staat dan
-- op "nog 6 beurten" terwijl er in werkelijkheid niets meer bruikbaar is — precies het lid dat het
-- segment "Sessies bijna op" zou moeten vangen, en precies het lid dat een nieuwe kaart van € 150
-- zou kopen. public.credits_balance() past dezelfde FIFO-vervalregel toe als de rest van de app,
-- zodat de activatiesegmenten en het saldo dat het lid zelf ziet niet langer uit elkaar lopen.
--
-- credits_balance is security definer en weigert een saldo van iemand anders wanneer er een
-- ingelogde gebruiker is. De view wordt uitsluitend gelezen door lib/activation.js via de
-- service-role (auth.uid() is dan null), dus die controle staat hier niemand in de weg.
create or replace view member_engagement as
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
    public.credits_balance(p.id) as credits,
    ( select count(*) from memberships m
          where m.user_id = p.id and m.status = 'actief'::text) as active_memberships,
    ( select count(*) from memberships m
          where m.user_id = p.id) as ever_memberships
   from profiles p
  where role = 'lid'::user_role;
