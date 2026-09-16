-- 0164 — Meerdere momenten in één keer boeken.
--
-- Ontwerp: docs/plans/2026-09-13-meerdere-momenten-boeken.md (v2, na een adversariële review van 101 agenten).
--
-- De kern in één zin: een MAND (booking_orders) groepeert 2 tot 8 boekingen die samen gemaakt en samen betaald
-- worden, en de Stripe-SESSIE — niet de mand — is de bron van waarheid voor wat er betaald werd.
--
-- Wat deze migratie NIET verandert: de publieke signatuur van create_booking. Die blijft identiek voor het
-- bestaande pad van één boeking; de body verhuist enkel naar _create_booking, dat een mand kan meekrijgen.

-- ============================================================================================================
-- 1. Tabellen
-- ============================================================================================================

create table if not exists public.booking_orders (
  id                    uuid primary key default gen_random_uuid(),
  gym_id                uuid not null references public.gyms(id) on delete cascade,
  -- Nullable met SET NULL: anders breekt "Gebruiker verwijderen" voor elk lid dat ooit een mand had.
  user_id               uuid references public.profiles(id) on delete set null,
  status                text not null default 'open' check (status in ('open', 'betaald', 'verlopen', 'geannuleerd')),
  -- Idempotentie per indiening: dezelfde knop twee keer (dubbelklik, netwerk-retry) = dezelfde mand.
  client_key            uuid,
  total_cents           int not null default 0,
  discount_code_id      uuid references public.discount_codes(id) on delete set null,
  stripe_session_id     text,
  stripe_payment_intent text,
  created_at            timestamptz not null default now(),
  paid_at               timestamptz
);
create unique index if not exists booking_orders_client_key_uniq on public.booking_orders (user_id, client_key) where client_key is not null;
create index if not exists booking_orders_user_idx on public.booking_orders (user_id, created_at desc);

-- Welke boekingen in WELKE Stripe-sessie aangerekend werden, en voor hoeveel. Een hervatte betaling maakt een
-- nieuwe sessie met enkel de rijen die toen nog open stonden; de webhook kijkt uitsluitend naar deze lijnen.
create table if not exists public.booking_order_lines (
  session_id   text not null,
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  order_id     uuid not null references public.booking_orders(id) on delete cascade,
  charge_cents int  not null check (charge_cents >= 0),
  created_at   timestamptz not null default now(),
  primary key (session_id, booking_id)
);
create index if not exists booking_order_lines_order_idx on public.booking_order_lines (order_id);

-- Eén rij per afgerekende sessie. Een tweede aflevering van hetzelfde Stripe-event leest dit en doet niets opnieuw.
create table if not exists public.booking_order_settlements (
  session_id         text primary key,
  order_id           uuid references public.booking_orders(id) on delete set null,
  payment_intent     text,
  confirmed          uuid[] not null default '{}',
  refund_booking_ids uuid[] not null default '{}',
  refund_cents       int not null default 0,
  refund_id          text,
  -- Claimvlag voor de NAZORG (bevestigingsmail, kortingsregistratie, aanbrengbeloning). Die stappen mogen niet
  -- hangen aan "is dit de eerste aflevering van dit event": faalt er iets NA de settle-commit, dan geeft de
  -- webhook 500, probeert Stripe opnieuw, en zou de nazorg voorgoed overgeslagen worden -- betaald lid zonder
  -- bevestigingsmail en een eenmalige code die nooit verbruikt werd (review #3/#6/#15).
  nazorg_at          timestamptz,
  created_at         timestamptz not null default now()
);
alter table public.booking_order_settlements add column if not exists nazorg_at timestamptz;

alter table public.bookings add column if not exists order_id uuid references public.booking_orders(id) on delete set null;
create index if not exists bookings_order_idx on public.bookings (order_id) where order_id is not null;
alter table public.payments add column if not exists order_id uuid references public.booking_orders(id) on delete set null;

-- ---- Rechten -------------------------------------------------------------------------------------------------
alter table public.booking_orders enable row level security;
alter table public.booking_order_lines enable row level security;
alter table public.booking_order_settlements enable row level security;

drop policy if exists booking_orders_select on public.booking_orders;
create policy booking_orders_select on public.booking_orders for select
  using (gym_id = public.current_gym_id() and (public.is_staff() or user_id = auth.uid()));

-- Een lid LEEST zijn mand. Schrijven gebeurt uitsluitend via de functies hieronder of de service role.
revoke all on public.booking_orders from public, anon, authenticated;
grant select on public.booking_orders to authenticated;
revoke all on public.booking_order_lines from public, anon, authenticated;
revoke all on public.booking_order_settlements from public, anon, authenticated;
grant all on public.booking_orders, public.booking_order_lines, public.booking_order_settlements to service_role;

-- bookings.order_id: 0132 werkt met KOLOMrechten, en een nieuwe kolom erft er geen. Lezen mag (de app toont de mand);
-- schrijven niet — anders hangt een lid zijn boeking aan een andere, al betaalde mand.
grant select (order_id) on public.bookings to authenticated;
grant select (order_id) on public.payments to authenticated;

-- ============================================================================================================
-- 2. _create_booking — de body van create_booking, met een optionele mand
-- ============================================================================================================

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
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn om te boeken.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  if v_hours * 2 <> round(v_hours * 2) or v_hours < 1 or v_hours > 4 then
    raise exception 'Ongeldige duur.' using errcode='P0001';
  end if;
  select gym_id, welcome_code_used, welcome_status, role into v_gym, v_used, v_wstatus, v_role from profiles where id = v_uid;
  if v_gym is null then raise exception 'Geen profiel gevonden.' using errcode='P0001'; end if;

  -- ⬇ NIEUW IN 0164: een mand mag enkel de eigen, open mand zijn die in DEZE transactie gemaakt werd. now() is
  -- constant binnen een transactie, dus een mand van gisteren of van een ander lid valt hier af.
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

  -- ⬇ NIEUW IN 0164: de welkomstsessie ATOMAIR claimen. Eerst lezen (hierboven) en pas na de insert schrijven liet
  -- twee parallelle aanroepen allebei welcome_code_used=false zien — twee gratis sessies. De UPDATE met de
  -- voorwaarde neemt een rijslot; de tweede wacht, ziet de eerste claim en krijgt 0 rijen.
  -- In een mand is de welkomstsessie nooit van toepassing (ontwerp v2 §G).
  v_free := false;
  if p_use_welcome and p_order is null and v_wstatus = 'eligible' and v_srv.type = 'fit60' and v_hours = 1 then
    update profiles set welcome_code_used = true
     where id = v_uid and not coalesce(welcome_code_used, false) and welcome_status = 'eligible'
     returning true into v_free;
    v_free := coalesce(v_free, false);
  end if;
  v_factor := 1; -- no multi-hour discount

  if v_free then
    v_price := 0; v_source := 'gratis_code';
  elsif p_use_credit then
    perform pg_advisory_xact_lock(hashtext('credits:' || v_uid::text));
    v_bal := public.credits_balance(v_uid);
    if v_bal < v_hours then raise exception 'Onvoldoende sessies voor deze duur.' using errcode='P0001'; end if;
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
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid, order_id)
    values (v_gym, v_srv.id, v_uid, p_coach, v_start, v_end, p_persons, v_source, v_price, v_free or p_use_credit, p_order)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is net geboekt. Kies een ander uur.' using errcode='P0001';
  end;

  if v_source = 'credit' then
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id) values (v_gym, v_uid, -v_hours, 'gebruik', v_id);
  end if;
  return v_id;
end; $function$;

-- Functies krijgen standaard EXECUTE voor PUBLIC, en Supabase geeft anon/authenticated er nog eens bij.
-- _create_booking mag enkel van binnenuit aangeroepen worden: per rol intrekken (0132: revoke from public alleen
-- volstaat NIET).
revoke all on function public._create_booking(uuid, date, numeric, integer, boolean, uuid, boolean, numeric, uuid) from public;
revoke all on function public._create_booking(uuid, date, numeric, integer, boolean, uuid, boolean, numeric, uuid) from anon;
revoke all on function public._create_booking(uuid, date, numeric, integer, boolean, uuid, boolean, numeric, uuid) from authenticated;

-- create_booking: dezelfde signatuur, dezelfde rechten (create or replace behoudt ze), nu een omhulsel.
create or replace function public.create_booking(p_service uuid, p_date date, p_hour numeric, p_persons integer default 1, p_use_welcome boolean default false, p_coach uuid default null::uuid, p_use_credit boolean default false, p_hours numeric default 1)
 returns uuid
 language sql
 security definer
 set search_path to 'public'
as $function$
  select public._create_booking(p_service, p_date, p_hour, p_persons, p_use_welcome, p_coach, p_use_credit, p_hours, null);
$function$;

-- ============================================================================================================
-- 3. create_booking_batch — alles of niets
-- ============================================================================================================

create or replace function public.create_booking_batch(p_service uuid, p_slots jsonb, p_persons integer default 1, p_hours numeric default 1, p_use_credit boolean default false, p_client_key uuid default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_gym uuid;
  v_order uuid;
  v_n int;
  v_hours numeric := coalesce(p_hours, 1);
  v_bal numeric;
  v_total int;
  v_idx int := 0;
  v_label text;
  r record;
  c_dag constant text[] := array['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn om te boeken.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = v_uid;
  if v_gym is null then raise exception 'Geen profiel gevonden.' using errcode='P0001'; end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then raise exception 'Geen momenten gekozen.' using errcode='P0001'; end if;
  v_n := jsonb_array_length(p_slots);
  if v_n < 2 then raise exception 'Kies minstens twee momenten.' using errcode='P0001'; end if;
  if v_n > 8 then raise exception 'Je kan maximaal 8 momenten in één keer boeken.' using errcode='P0001'; end if;

  -- Eén mand tegelijk per lid, en eerst het slot: pas daarna mag de idempotentie-check, anders zien twee
  -- gelijktijdige indieningen met dezelfde sleutel allebei "nog niet gemaakt".
  perform pg_advisory_xact_lock(hashtext('hold:' || v_uid::text));
  if p_client_key is not null then
    select id into v_order from booking_orders where user_id = v_uid and client_key = p_client_key;
    if v_order is not null then return v_order; end if;
  end if;

  -- Verlopen holds eerst opruimen, in DEZE transactie. free_expired_slot wordt via create_booking nooit bereikt
  -- (de precheck raiset vóór de insert), dus zonder dit breekt één verlopen, niet-opgeruimde hold de hele mand.
  perform public.expire_unpaid_bookings(v_gym);

  -- Dubbel of overlappend binnen de mand: een nette zin in plaats van een exclusion-fout halverwege.
  if exists (
    with s as (
      select ((e->>'date')::date + make_interval(mins => round((e->>'hour')::numeric * 60)::int)) at time zone 'Europe/Brussels' as t
      from jsonb_array_elements(p_slots) e
    ), o as (select t, lead(t) over (order by t) as nxt from s)
    select 1 from o where nxt is not null and nxt < t + make_interval(mins => round(v_hours * 60)::int)
  ) then
    raise exception 'Twee gekozen momenten overlappen. Kies ze minstens % na elkaar.',
      case when v_hours = 1 then '1 uur' else replace(v_hours::text, '.', ',') || ' uur' end using errcode='P0001';
  end if;

  -- De hamsterrem vooraf, zonder momentlabel: het gaat over een ándere, openstaande betaling, niet over het eerste
  -- moment van deze mand. (De trigger block_hoarding dwingt hetzelfde nog eens af per rij.)
  if not p_use_credit and exists (
    select 1 from bookings
     where user_id = v_uid and status = 'bevestigd' and paid = false and price_cents > 0
       and payment_source in ('los', 'abo') and created_at >= now() - interval '15 minutes'
  ) then
    raise exception 'Je hebt nog een boeking die op betaling wacht. Rond die eerst af — daarna kan je meerdere momenten vastzetten.' using errcode='P0001';
  end if;

  if p_use_credit then
    perform pg_advisory_xact_lock(hashtext('credits:' || v_uid::text));
    v_bal := public.credits_balance(v_uid);
    if v_bal < v_hours * v_n then
      raise exception 'Je hebt % sessie(s) tegoed; voor deze % momenten heb je er % nodig.',
        replace(trim_scale(v_bal)::text, '.', ','), v_n, replace(trim_scale(v_hours * v_n)::text, '.', ',') using errcode='P0001';
    end if;
  end if;

  insert into booking_orders (gym_id, user_id, client_key) values (v_gym, v_uid, p_client_key) returning id into v_order;

  -- Op starttijd gesorteerd: twee manden met dezelfde momenten in een andere volgorde zouden elkaar anders op de
  -- exclusion constraint kunnen vastzetten (deadlock).
  for r in
    select (e->>'date')::date as d, (e->>'hour')::numeric as h,
           ((e->>'date')::date + make_interval(mins => round((e->>'hour')::numeric * 60)::int)) at time zone 'Europe/Brussels' as t,
           (ord - 1)::int as i
    from jsonb_array_elements(p_slots) with ordinality as x(e, ord)
    order by 3
  loop
    v_idx := r.i;
    v_label := c_dag[extract(dow from (r.t at time zone 'Europe/Brussels'))::int + 1] || ' '
               || to_char(r.t at time zone 'Europe/Brussels', 'DD/MM HH24:MI');
    begin
      perform public._create_booking(p_service, r.d, r.h, p_persons, false, null, p_use_credit, v_hours, v_order);
    exception
      -- Het moment erbij, en de index in HINT zodat het scherm precies dat moment kan markeren. De raise breekt
      -- de hele functie af: niets van de mand blijft staan, ook het tegoed niet.
      when sqlstate 'P0001' then
        raise exception '% — %', v_label, sqlerrm using errcode='P0001', hint = v_idx::text;
      when deadlock_detected then
        raise exception '% — Dit moment wordt net door iemand anders geboekt. Probeer het opnieuw.', v_label using errcode='P0001', hint = v_idx::text;
    end;
  end loop;

  select coalesce(sum(price_cents), 0) into v_total from bookings where order_id = v_order and paid = false;
  update booking_orders
     set total_cents = v_total,
         status  = case when v_total = 0 then 'betaald' else 'open' end,
         paid_at = case when v_total = 0 then now() end
   where id = v_order;
  return v_order;
end; $function$;

revoke all on function public.create_booking_batch(uuid, jsonb, integer, numeric, boolean, uuid) from public;
revoke all on function public.create_booking_batch(uuid, jsonb, integer, numeric, boolean, uuid) from anon;
grant execute on function public.create_booking_batch(uuid, jsonb, integer, numeric, boolean, uuid) to authenticated;

-- ============================================================================================================
-- 4. Hamsterrem per mand
-- ============================================================================================================

create or replace function public.block_hoarding()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_n int;
begin
  if new.status = 'bevestigd' and new.paid = false and coalesce(new.price_cents, 0) > 0
     and new.payment_source in ('los', 'abo') then
    -- Serialiseren per lid. Re-entrant binnen dezelfde transactie, dus de 8 inserts van één mand lopen niet vast;
    -- twee parallelle manden van hetzelfde lid wachten op elkaar en zien elkaars holds.
    perform pg_advisory_xact_lock(hashtext('hold:' || new.user_id::text));

    if new.order_id is not null then
      -- In een mand: geen andere openstaande betaling ernaast. Anders houdt één lid met twee manden 16 momenten vast.
      select count(*) into v_n from bookings
       where user_id = new.user_id and status = 'bevestigd' and paid = false
         and price_cents > 0 and payment_source in ('los', 'abo')
         and created_at >= now() - interval '15 minutes'
         and (order_id is null or order_id <> new.order_id);
      if v_n > 0 then
        raise exception 'Je hebt nog een boeking die op betaling wacht. Rond die eerst af — daarna kan je meerdere momenten vastzetten.' using errcode='P0001';
      end if;
    else
      -- Eén moment: zoals voordien max 2 openstaande reserveringen, en een open mand telt als één.
      select count(distinct coalesce(order_id, id)) into v_n from bookings
       where user_id = new.user_id and status = 'bevestigd' and paid = false
         and price_cents > 0 and payment_source in ('los', 'abo')
         and created_at >= now() - interval '15 minutes';
      if v_n >= 2 then
        raise exception 'Je hebt al 2 boekingen die op betaling wachten. Rond die eerst af — daarna kan je weer een moment vastzetten.' using errcode='P0001';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

-- ============================================================================================================
-- 5. Vervallen — één melding per mand, en de mand zelf op 'verlopen'
-- ============================================================================================================

create or replace function public.expire_unpaid_bookings(p_gym uuid default null)
returns int language plpgsql security definer set search_path = public as $function$
declare n int; v_orders uuid[];
begin
  with x as (
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where status = 'bevestigd' and paid = false and price_cents > 0
      and payment_source in ('los', 'abo')
      and created_at < now() - interval '15 minutes'
      and (p_gym is null or gym_id = p_gym)
    returning id, gym_id, user_id, order_id
  ),
  groep as (
    select distinct on (coalesce(order_id, id)) gym_id, user_id, order_id from x
  ),
  ins as (
    insert into notifications (gym_id, user_id, type, title, body, link)
    select g.gym_id, g.user_id, 'system',
           case when g.order_id is null then 'Je onbetaalde boeking is verlopen' else 'Je onbetaalde boekingen zijn verlopen' end,
           case when g.order_id is null
                then 'De plek is weer vrijgegeven omdat de betaling niet binnen 15 minuten binnenkwam. Boek gerust opnieuw.'
                else 'De momenten zijn weer vrijgegeven omdat de betaling niet binnen 15 minuten binnenkwam. Boek gerust opnieuw.' end,
           '/boeken'
    from groep g
    returning 1
  )
  select count(*), array_agg(distinct order_id) filter (where order_id is not null) into n, v_orders from x;

  -- Apart statement ná de CTE: een extra CTE ziet de eigen UPDATE hierboven niet, en zou elke mand 'open' laten.
  if v_orders is not null then
    update booking_orders o set status = 'verlopen'
     where o.id = any(v_orders) and o.status = 'open'
       and not exists (select 1 from bookings b where b.order_id = o.id and b.status = 'bevestigd' and b.paid = false and b.price_cents > 0);
  end if;
  return n;
end;
$function$;

-- ============================================================================================================
-- 6. settle_booking_order — afrekenen in één transactie (enkel de service role / webhook)
-- ============================================================================================================

create or replace function public.settle_booking_order(p_session text, p_pi text)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  s booking_order_settlements%rowtype;
  v_order uuid;
  v_confirmed uuid[] := '{}';
  v_refund_ids uuid[] := '{}';
  v_refund int := 0;
  r record;
begin
  select * into s from booking_order_settlements where session_id = p_session;
  if found then
    return jsonb_build_object('order_id', s.order_id, 'confirmed', to_jsonb(s.confirmed), 'refund_booking_ids', to_jsonb(s.refund_booking_ids),
                              'refund_cents', s.refund_cents, 'refund_id', s.refund_id, 'herhaald', true);
  end if;

  select order_id into v_order from booking_order_lines where session_id = p_session limit 1;
  if v_order is null then raise exception 'Geen mandlijnen voor sessie %', p_session; end if;

  -- Slot op de mand, en daarna opnieuw kijken: twee gelijktijdige afleveringen van hetzelfde event.
  perform 1 from booking_orders where id = v_order for update;
  select * into s from booking_order_settlements where session_id = p_session;
  if found then
    return jsonb_build_object('order_id', s.order_id, 'confirmed', to_jsonb(s.confirmed), 'refund_booking_ids', to_jsonb(s.refund_booking_ids),
                              'refund_cents', s.refund_cents, 'refund_id', s.refund_id, 'herhaald', true);
  end if;

  -- Per lijn beslissen op de toestand ONDER SLOT, niet op iets dat eerder gelezen werd. De expire-sweep wacht zo
  -- op ons, of wij op hem — nooit half.
  for r in
    select l.booking_id, l.charge_cents, b.status, b.paid, b.stripe_payment_intent
    from booking_order_lines l join bookings b on b.id = l.booking_id
    where l.session_id = p_session
    order by l.booking_id
    for update of b
  loop
    if r.status = 'bevestigd' and not r.paid then
      update bookings set paid = true, stripe_payment_intent = p_pi, charge_cents = r.charge_cents where id = r.booking_id;
      v_confirmed := v_confirmed || r.booking_id;
    elsif r.status = 'bevestigd' and r.paid and r.stripe_payment_intent is not distinct from p_pi then
      v_confirmed := v_confirmed || r.booking_id;
    else
      -- Geannuleerd (hold verlopen), of al betaald met ANDER geld (hervat, cash aan de balie): dit deel van deze
      -- sessie gaat terug. Nooit een rij annuleren die met ander geld betaald is.
      if r.charge_cents > 0 then
        v_refund := v_refund + r.charge_cents;
        v_refund_ids := v_refund_ids || r.booking_id;
      end if;
    end if;
  end loop;

  insert into booking_order_settlements (session_id, order_id, payment_intent, confirmed, refund_booking_ids, refund_cents)
  values (p_session, v_order, p_pi, v_confirmed, v_refund_ids, v_refund);

  if coalesce(array_length(v_confirmed, 1), 0) > 0 then
    update booking_orders
       set status = 'betaald', paid_at = coalesce(paid_at, now()), stripe_payment_intent = coalesce(stripe_payment_intent, p_pi)
     where id = v_order;
  end if;

  return jsonb_build_object('order_id', v_order, 'confirmed', to_jsonb(v_confirmed), 'refund_booking_ids', to_jsonb(v_refund_ids),
                            'refund_cents', v_refund, 'refund_id', null, 'herhaald', false);
end;
$function$;

revoke all on function public.settle_booking_order(text, text) from public;
revoke all on function public.settle_booking_order(text, text) from anon;
revoke all on function public.settle_booking_order(text, text) from authenticated;
grant execute on function public.settle_booking_order(text, text) to service_role;
