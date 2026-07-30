-- 0116 — "Op factuur"-coaches boekten GRATIS. Oorzaak + fix.
--
-- Oorzaak: coach_book_session neemt bij mode 'invoice' het bedrag uit
-- profiles.coach_session_price_cents. Bij Jan Matthys en TDW Personal Training stond dat op 0
-- (handmatig gezet in het oude beheerscherm dat nog free/credit/invoice aanbood). Resultaat:
-- elke boeking werd geregistreerd met coach_charge_cents = 0 → "Te factureren: € 0,00" en dus
-- nooit een factuur. 12 bevestigde sessies (Jan 8, TDW 4) = € 144 niet aangerekend.
--
-- Fix, drieledig:
--  1. RPC: bij 'invoice' nooit meer € 0 — val terug op het standaardtarief (€ 12) wanneer de
--     coachprijs leeg of 0 is. Gratis kan enkel nog via de expliciete mode 'free'.
--  2. Bestaande invoice-coaches krijgen het standaardtarief op hun profiel.
--  3. Reeds geboekte, bevestigde invoice-sessies worden op € 12 gezet zodat ze factureerbaar
--     worden (de owner beslist zelf of hij ze effectief aanrekent of kwijtscheldt).
-- Plus: bookings.coach_invoiced_at markeert wat al gefactureerd is, zodat een sessie nooit
-- twee keer op een factuur belandt.

alter table bookings add column if not exists coach_invoiced_at timestamptz;
create index if not exists bookings_coach_invoice_idx on bookings(coach_id, coach_billing, coach_invoiced_at);

-- 2. Profielprijs herstellen (0 of null → standaard € 12).
update profiles
   set coach_session_price_cents = 1200
 where coach_billing_mode = 'invoice'
   and coalesce(coach_session_price_cents, 0) = 0;

-- 3. Reeds geboekte bevestigde sessies factureerbaar maken.
update bookings
   set coach_charge_cents = 1200
 where coach_billing = 'invoice'
   and status = 'bevestigd'
   and coalesce(coach_charge_cents, 0) = 0;

-- 1. RPC: invoice-tarief kan nooit meer 0 zijn.
create or replace function public.coach_book_session(p_client uuid, p_service uuid, p_date date, p_hour numeric, p_persons integer default 1, p_use_client_credit boolean default false)
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
  v_lbal int;
begin
  select gym_id, role, coach_billing_mode, coach_session_price_cents
    into v_gym, v_role, v_mode, v_price from profiles where id = v_coach;
  if v_role not in ('coach', 'beheerder') then raise exception 'Alleen coaches kunnen dit.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;

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
    -- Boeken kan enkel met minstens 1 sessietegoed (0115). Advisory lock tegen de dubbel-boek-race.
    perform pg_advisory_xact_lock(hashtext('coach_ledger:' || v_coach::text));
    select coalesce(sum(delta), 0) into v_lbal from coach_ledger where coach_id = v_coach;
    if v_lbal < 1 then
      raise exception 'Onvoldoende sessietegoed (saldo: %). Koop eerst tegoed bij — een aankoop zuivert ook een openstaand saldo aan, daarna kan je weer boeken.', v_lbal using errcode='P0001';
    end if;
    v_billing := 'credit'; v_charge := 0;
  else
    -- Maandfactuur: nooit € 0. Een leeg/0-tarief viel stil terug op gratis boeken — nu op het
    -- standaardtarief van € 12. Écht gratis coachen kan enkel via de expliciete mode 'free'.
    v_billing := 'invoice'; v_charge := coalesce(nullif(v_price, 0), 1200);
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
end; $function$;
