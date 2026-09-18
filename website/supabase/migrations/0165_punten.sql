-- 0165 — Fittin' Punten: puntenboek, zaalcheck, rustige uren, gastbevestiging.
--
-- Plan: docs/plans/2026-09-18-gamification-community.md (v3). Alles hier is additief, op één uitzondering na:
-- _create_booking en reschedule_booking krijgen de rustige-urenregel, en refund_member_credit betaalt voortaan
-- terug wat er ÉCHT verbruikt werd in plaats van de duur af te ronden.
--
-- Waarom één migratie: de onderdelen hangen aan elkaar (een rustig uur geeft dubbele punten, een zaalcheck geeft
-- punten), en één rollbacktest op productie dekt dan het geheel.
--
-- Geen punten met terugwerkende kracht (beslissing eigenaar 2026-09-18): gamification_settings.gestart_op = het
-- moment waarop deze migratie draait. Alles vóór dat moment levert niets op.

-- ============================================================================================================
-- 1. Instellingen per gym
-- ============================================================================================================

create table if not exists public.gamification_settings (
  gym_id              uuid primary key references public.gyms(id) on delete cascade,
  aan                 boolean not null default true,
  gestart_op          timestamptz not null default now(),
  -- Enkel AFWIJKINGEN van de standaardwaarden in lib/punten.js. Een lege {} = alles standaard.
  waarden             jsonb not null default '{}'::jsonb,
  prijs_sessie        int  not null default 300 check (prijs_sessie between 50 and 5000),
  max_gym_maand       int  not null default 10  check (max_gym_maand between 0 and 500),
  max_aanbreng_maand  int  not null default 5   check (max_aanbreng_maand between 0 and 500),
  max_per_lid_maand   int  not null default 1   check (max_per_lid_maand between 0 and 10),
  verval_maanden      int  not null default 12  check (verval_maanden between 1 and 60),
  rustig_aan          boolean not null default true,
  rustig_max_weken    int  not null default 2   check (rustig_max_weken between 0 and 8),
  druk_min_weken      int  not null default 5   check (druk_min_weken between 1 and 8),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles(id) on delete set null
);
insert into public.gamification_settings (gym_id) select id from public.gyms on conflict (gym_id) do nothing;

-- Wie veranderde wat, wanneer. Instellingen raken geld (gratis sessies), dus een wijziging moet terug te vinden zijn.
create table if not exists public.gamification_log (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  door       uuid references public.profiles(id) on delete set null,
  wat        text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================================================
-- 2. Het puntenboek — append-only, uniek per bron
-- ============================================================================================================

create table if not exists public.member_points (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  points      int  not null,
  -- Idempotentie: 'sessie:<booking>:<user>', 'week:<user>:2026-W38', 'inwissel:<uuid>' … Een tweede cron-run, een
  -- herhaalde webhook of een dubbele klik levert zo nooit dubbele punten op.
  source_key  text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint member_points_bron_uniek unique (gym_id, source_key)
);
create index if not exists member_points_user_idx on public.member_points (user_id, created_at desc);
create index if not exists member_points_gym_idx  on public.member_points (gym_id, created_at desc);

create table if not exists public.member_badges (
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  badge      text not null,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge)
);

-- ============================================================================================================
-- 3. Zaalcheck — "hoe vond je de zaal toen je binnenkwam?"
-- ============================================================================================================

create table if not exists public.zaal_checks (
  booking_id        uuid primary key references public.bookings(id) on delete cascade,
  gym_id            uuid not null references public.gyms(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  state             text not null check (state in ('netjes','rommel','stuk')),
  tags              text[] not null default '{}',
  photo_path        text,
  -- Vastgelegd BIJ het inchecken, nooit achteraf herberekend: wie er vóór zat, verandert niet meer.
  previous_booking  uuid references public.bookings(id) on delete set null,
  previous_kind     text check (previous_kind in ('lid','eigen','pt')),
  previous_user     uuid references public.profiles(id) on delete set null,
  owner_verdict     text check (owner_verdict in ('terecht','onterecht')),
  herinnerd_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists zaal_checks_gym_idx  on public.zaal_checks (gym_id, created_at desc);
create index if not exists zaal_checks_prev_idx on public.zaal_checks (previous_user, created_at desc);

-- "Ik heb alles teruggelegd" na de sessie. Geen bewijs, wel context voor de volgende check.
alter table public.bookings add column if not exists netjes_verklaard_at timestamptz;

-- ============================================================================================================
-- 4. Gasten die bevestigen dat ze meekomen
-- ============================================================================================================

alter table public.booking_participants add column if not exists confirmed_at timestamptz;
alter table public.email_invites        add column if not exists confirmed_at timestamptz;

-- ============================================================================================================
-- 5. Profiel: weekdoel en herkomst
-- ============================================================================================================

alter table public.profiles add column if not exists streak_target smallint not null default 1;
do $$ begin
  alter table public.profiles add constraint profiles_streak_target_chk check (streak_target between 1 and 4);
exception when duplicate_object then null; end $$;
alter table public.profiles add column if not exists hoe_gevonden text;

-- Hoe voelde je training (1 = zwaar … 4 = sterk), optioneel na de sterren.
alter table public.session_feedback add column if not exists energie smallint;
do $$ begin
  alter table public.session_feedback add constraint session_feedback_energie_chk check (energie between 1 and 4);
exception when duplicate_object then null; end $$;

-- ============================================================================================================
-- 6. Rustige uren
-- ============================================================================================================

create table if not exists public.slot_demand (
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  dow           smallint not null check (dow between 1 and 7),     -- ISO: 1 = maandag
  hour          smallint not null check (hour between 0 and 23),
  weeks_booked  smallint not null default 0,
  klasse        text not null default 'normaal' check (klasse in ('rustig','normaal','druk')),
  pin           text check (pin in ('altijd','nooit')),             -- handmatige keuze van de uitbater
  computed_at   timestamptz not null default now(),
  primary key (gym_id, dow, hour)
);

-- De promotie wordt op de boeking bevroren: de nachtelijke herberekening mag ze achteraf niet wegnemen.
alter table public.bookings add column if not exists promo text;
do $$ begin
  alter table public.bookings add constraint bookings_promo_chk check (promo in ('rustig'));
exception when duplicate_object then null; end $$;

-- Is dit startmoment een rustig uur? Eén regel, gedeeld door boeken en verplaatsen:
--   pin 'nooit' → nee · pin 'altijd' → ja · druk → nee · rustig → ja · binnen 24 u en niet druk → ja (last minute).
create or replace function public.slot_promo(p_gym uuid, p_start timestamptz)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when not coalesce(s.rustig_aan, true) then null
    when d.pin = 'nooit' then null
    when d.pin = 'altijd' then 'rustig'
    when d.klasse = 'druk' then null
    when d.klasse = 'rustig' then 'rustig'
    when p_start - now() <= interval '24 hours' and p_start > now() then 'rustig'
    else null
  end
  from (select 1) x
  left join public.gamification_settings s on s.gym_id = p_gym
  left join public.slot_demand d
    on d.gym_id = p_gym
   and d.dow  = extract(isodow from (p_start at time zone 'Europe/Brussels'))::int
   and d.hour = extract(hour   from (p_start at time zone 'Europe/Brussels'))::int
$$;
revoke all on function public.slot_promo(uuid, timestamptz) from public;
revoke all on function public.slot_promo(uuid, timestamptz) from anon;
revoke all on function public.slot_promo(uuid, timestamptz) from authenticated;
grant execute on function public.slot_promo(uuid, timestamptz) to service_role;

-- ============================================================================================================
-- 7. _create_booking: rustig uur = 2 uur voor de prijs van 1 (Fit60, ≥ 2 uur), en bevroren promo
-- ============================================================================================================
-- Identiek aan 0164, behalve de drie blokken gemarkeerd met ⬇ 0165.

create or replace function public._create_booking(p_service uuid, p_date date, p_hour numeric, p_persons integer, p_use_welcome boolean, p_coach uuid, p_use_credit boolean, p_hours numeric, p_order uuid)
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
  v_promo text;
  v_kost numeric;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn om te boeken.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  if v_hours * 2 <> round(v_hours * 2) or v_hours < 1 or v_hours > 4 then
    raise exception 'Ongeldige duur.' using errcode='P0001';
  end if;
  select gym_id, welcome_code_used, welcome_status, role into v_gym, v_used, v_wstatus, v_role from profiles where id = v_uid;
  if v_gym is null then raise exception 'Geen profiel gevonden.' using errcode='P0001'; end if;

  if p_order is not null and not exists (
    select 1 from booking_orders o
    where o.id = p_order and o.user_id = v_uid and o.gym_id = v_gym and o.status = 'open' and o.created_at = now()
  ) then
    raise exception 'Ongeldige mand.' using errcode='P0001';
  end if;

  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_hours > v_close then raise exception 'De gekozen duur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => round(v_hours * 60)::int);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

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

  v_free := false;
  if p_use_welcome and p_order is null and v_wstatus = 'eligible' and v_srv.type = 'fit60' and v_hours = 1 then
    update profiles set welcome_code_used = true
     where id = v_uid and not coalesce(welcome_code_used, false) and welcome_status = 'eligible'
     returning true into v_free;
    v_free := coalesce(v_free, false);
  end if;
  v_factor := 1;

  -- ⬇ 0165: een rustig uur. Enkel voor gymsessies (Fit60), nooit samen met de welkomstsessie of een coach.
  -- Het label geldt voor élke duur (dubbele punten); de prijsregel pas vanaf twee uur: één uur valt weg.
  v_promo := null;
  if v_srv.type = 'fit60' and not v_free and p_coach is null then
    v_promo := public.slot_promo(v_gym, v_start);
  end if;
  if v_promo = 'rustig' and v_hours >= 2 then
    v_factor := (v_hours - 1) / v_hours;
  end if;
  v_kost := v_hours * v_factor;   -- wat er aan tegoed afgaat

  if v_free then
    v_price := 0; v_source := 'gratis_code';
  elsif p_use_credit then
    perform pg_advisory_xact_lock(hashtext('credits:' || v_uid::text));
    v_bal := public.credits_balance(v_uid);
    if v_bal < v_kost then raise exception 'Onvoldoende sessies voor deze duur.' using errcode='P0001'; end if;
    v_price := 0; v_source := 'credit';
  elsif v_member and v_srv.member_price_cents is not null then
    v_base := v_srv.member_price_cents; v_price := round(v_base * v_hours * v_factor); v_source := 'abo';
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
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid, order_id, promo)
    values (v_gym, v_srv.id, v_uid, p_coach, v_start, v_end, p_persons, v_source, v_price, v_free or p_use_credit, p_order, v_promo)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is net geboekt. Kies een ander uur.' using errcode='P0001';
  end;

  if v_source = 'credit' then
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id) values (v_gym, v_uid, -v_kost, 'gebruik', v_id);
  end if;
  return v_id;
end; $function$;

revoke all on function public._create_booking(uuid, date, numeric, integer, boolean, uuid, boolean, numeric, uuid) from public;
revoke all on function public._create_booking(uuid, date, numeric, integer, boolean, uuid, boolean, numeric, uuid) from anon;
revoke all on function public._create_booking(uuid, date, numeric, integer, boolean, uuid, boolean, numeric, uuid) from authenticated;

-- ============================================================================================================
-- 8. reschedule_booking: een rustig-uurboeking verhuist enkel naar een ander rustig uur
-- ============================================================================================================
-- Anders boek je twee rustige uren aan de prijs van één en verplaats je ze daarna naar maandagavond.

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
  v_horizon int;
  v_venster interval;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  select * into v_b from bookings where id = p_booking and (user_id = v_uid or coach_id = v_uid) and status = 'bevestigd';
  if v_b.id is null then raise exception 'Boeking niet gevonden.' using errcode='P0001'; end if;

  v_venster := case when is_staff() then interval '1 hour' else interval '6 hours' end;
  if now() > v_b.starts_at - v_venster then
    raise exception 'Verplaatsen kan tot % uur voor de sessie.', extract(hour from v_venster)::int using errcode='P0001';
  end if;

  v_hours := greatest(0.5, round(extract(epoch from (v_b.ends_at - v_b.starts_at)) / 1800.0) / 2.0);
  select open_hour, close_hour into v_open, v_close from gyms where id = v_b.gym_id;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_hours > v_close then raise exception 'De duur valt buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => round(v_hours * 60)::int);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

  v_horizon := public.booking_horizon_days(v_uid);
  if v_horizon is not null
     and (v_start at time zone 'Europe/Brussels')::date > ((now() at time zone 'Europe/Brussels')::date + v_horizon) then
    raise exception 'Je kan tot % weken vooruit plannen.', (v_horizon / 7) using errcode='P0001';
  end if;

  -- ⬇ 0165
  if v_b.promo = 'rustig' and not is_staff() and public.slot_promo(v_b.gym_id, v_start) is distinct from 'rustig' then
    raise exception 'Dit was een boeking op een rustig uur (voordeelprijs). Verplaats ze naar een ander rustig uur, of annuleer en boek opnieuw.' using errcode='P0001';
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

-- ============================================================================================================
-- 9. refund_member_credit: terug wat er verbruikt werd
-- ============================================================================================================
-- Vroeger: de duur, afgerond op hele uren. Dat gaf bij 90 minuten 2 beurten terug voor 1,5 verbruikt, en zou bij een
-- rustig uur (2 uur voor 1 beurt) 2 beurten teruggeven. Nu: precies de 'gebruik'-rij(en) van deze boeking. Geen
-- gebruik-rij (oude of door beheer geboekte sessie)? Dan de oude regel.

create or replace function public.refund_member_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hours numeric; v_mag boolean; v_gebruikt numeric;
begin
  if new.status = 'geannuleerd' and old.status <> 'geannuleerd' and new.payment_source = 'credit' then
    v_mag := new.starts_at > now() or auth.uid() is null or is_staff();
    if v_mag and not exists (select 1 from credits_ledger where ref_id = new.id and reason = 'refund') then
      select -sum(delta) into v_gebruikt from credits_ledger where ref_id = new.id and reason = 'gebruik';
      v_hours := coalesce(nullif(v_gebruikt, 0),
                          greatest(1, round(extract(epoch from (new.ends_at - new.starts_at)) / 3600.0)::int));
      insert into credits_ledger (gym_id, user_id, delta, reason, ref_id)
      values (new.gym_id, new.user_id, v_hours, 'refund', new.id);
    end if;
  end if;
  return new;
end; $$;

-- ============================================================================================================
-- 10. Punten inwisselen voor een gratis sessie — atomair, met de drie remmen
-- ============================================================================================================

create or replace function public.wissel_punten_in(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_gym uuid; v_set gamification_settings%rowtype;
  v_bal int; v_n_lid int; v_n_gym int; v_pid uuid;
  v_maand timestamptz := (date_trunc('month', now() at time zone 'Europe/Brussels')) at time zone 'Europe/Brussels';
begin
  select gym_id into v_gym from profiles where id = p_user;
  if v_gym is null then raise exception 'Geen profiel gevonden.' using errcode='P0001'; end if;
  select * into v_set from gamification_settings where gym_id = v_gym;
  if v_set.gym_id is null or not v_set.aan then raise exception 'Punten staan momenteel uit.' using errcode='P0001'; end if;

  -- Eerst het lid, dan de gym: twee aanvragen van hetzelfde lid wachten op elkaar, en de gymteller kan niet door
  -- twee leden tegelijk over de grens geduwd worden.
  perform pg_advisory_xact_lock(hashtext('punten:' || p_user::text));
  perform pg_advisory_xact_lock(hashtext('punten-gym:' || v_gym::text));

  select coalesce(sum(points), 0) into v_bal from member_points where user_id = p_user and gym_id = v_gym;
  if v_bal < v_set.prijs_sessie then
    raise exception 'Je hebt nog % punten nodig voor een gratis sessie.', v_set.prijs_sessie - v_bal using errcode='P0001';
  end if;
  select count(*) into v_n_lid from member_points where user_id = p_user and kind = 'inwissel' and created_at >= v_maand;
  if v_n_lid >= v_set.max_per_lid_maand then
    raise exception 'Je wisselde deze maand al een gratis sessie in. Vanaf de 1e kan het weer — je punten blijven staan.' using errcode='P0001';
  end if;
  select count(*) into v_n_gym from member_points where gym_id = v_gym and kind = 'inwissel' and created_at >= v_maand;
  if v_n_gym >= v_set.max_gym_maand then
    raise exception 'De gratis sessies van deze maand zijn op. Vanaf de 1e kan je weer inwisselen — je punten blijven staan.' using errcode='P0001';
  end if;

  v_pid := gen_random_uuid();
  insert into member_points (id, gym_id, user_id, kind, points, source_key, meta)
  values (v_pid, v_gym, p_user, 'inwissel', -v_set.prijs_sessie, 'inwissel:' || v_pid::text, jsonb_build_object('prijs', v_set.prijs_sessie));
  insert into credits_ledger (gym_id, user_id, delta, reason, ref_id, expires_at)
  values (v_gym, p_user, 1, 'punten', v_pid, now() + interval '3 months');
  return jsonb_build_object('ok', true, 'id', v_pid, 'saldo', v_bal - v_set.prijs_sessie);
end; $$;
revoke all on function public.wissel_punten_in(uuid) from public;
revoke all on function public.wissel_punten_in(uuid) from anon;
revoke all on function public.wissel_punten_in(uuid) from authenticated;
grant execute on function public.wissel_punten_in(uuid) to service_role;

-- ============================================================================================================
-- 11. Feed: niet meer bij het BOEKEN posten
-- ============================================================================================================
-- 0052 plaatste "trainde 1 uur" en de mijlpalen op het moment van boeken: vóór de training, en een annulering liet
-- de post staan. Het posten verhuist naar de puntencron (na ends_at, enkel voltooide sessies). Bestaande posts
-- blijven staan — niets wordt gewist.
drop trigger if exists trg_post_on_booking on public.bookings;

-- ============================================================================================================
-- 12. Rechten
-- ============================================================================================================

alter table public.gamification_settings enable row level security;
alter table public.gamification_log      enable row level security;
alter table public.member_points         enable row level security;
alter table public.member_badges         enable row level security;
alter table public.zaal_checks           enable row level security;
alter table public.slot_demand           enable row level security;

-- Lezen: het lid zijn eigen punten en badges; personeel alles van de eigen gym. Schrijven: enkel de service role
-- (server actions en crons). De zaalcheck is personeelsinformatie: wie er vóór je zat, ziet een lid nooit.
drop policy if exists member_points_select on public.member_points;
create policy member_points_select on public.member_points for select
  using (user_id = auth.uid() or (gym_id = public.current_gym_id() and public.is_staff()));
drop policy if exists member_badges_select on public.member_badges;
create policy member_badges_select on public.member_badges for select
  using (user_id = auth.uid() or (gym_id = public.current_gym_id() and public.is_staff()));
drop policy if exists zaal_checks_select on public.zaal_checks;
create policy zaal_checks_select on public.zaal_checks for select
  using (gym_id = public.current_gym_id() and public.is_staff());
drop policy if exists gamification_settings_select on public.gamification_settings;
create policy gamification_settings_select on public.gamification_settings for select
  using (gym_id = public.current_gym_id());
drop policy if exists gamification_log_select on public.gamification_log;
create policy gamification_log_select on public.gamification_log for select
  using (gym_id = public.current_gym_id() and public.is_staff());
drop policy if exists slot_demand_select on public.slot_demand;
create policy slot_demand_select on public.slot_demand for select
  using (gym_id = public.current_gym_id());

-- Supabase geeft anon/authenticated standaard alle rechten op nieuwe tabellen: per rol intrekken (0132-les).
revoke all on public.gamification_settings, public.gamification_log, public.member_points, public.member_badges,
              public.zaal_checks, public.slot_demand from public;
revoke all on public.gamification_settings, public.gamification_log, public.member_points, public.member_badges,
              public.zaal_checks, public.slot_demand from anon;
revoke all on public.gamification_settings, public.gamification_log, public.member_points, public.member_badges,
              public.zaal_checks, public.slot_demand from authenticated;
grant select on public.gamification_settings, public.member_points, public.member_badges, public.zaal_checks,
              public.gamification_log, public.slot_demand to authenticated;
grant all on public.gamification_settings, public.gamification_log, public.member_points, public.member_badges,
             public.zaal_checks, public.slot_demand to service_role;
