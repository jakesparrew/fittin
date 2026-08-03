-- 0119 — Gratis beheer-boekingen foolproof maken.
--
-- PROBLEEM: admin_create_booking maakte zonder p_use_credit stilzwijgend een GRATIS sessie
-- ('los' + € 0 + paid = true). Eén vergeten vinkje = weggegeven zaaltijd. Zo ontstonden ±9
-- gratis sessies (±€ 96 nooit gefactureerd) zonder dat iemand het merkte. Erger: had het lid
-- geen tegoed, dan wás gratis de enige uitweg — er bestond geen "laat maar betalen"-optie.
--
-- FIX (volledig additief op de data):
--  1) bookings krijgt comp_reason / comp_value_cents / comped_by / balie_charge: een gratis
--     sessie draagt voortaan WAAROM ze gratis was en WAT ze waard was.
--  2) De RPC krijgt drie expliciete modi: 'credit' (standaard) | 'charge' (lid betaalt aan de
--     balie) | 'gratis'. Gratis kan enkel MÉT reden. "Niets gekozen" is geen stille gratis
--     sessie meer maar een duidelijke foutmelding — ook bij een directe RPC-call of een oude
--     browsertab. De UI kan het lek dus niet meer omzeilen.
--  3) Twee latente bugs uit de vorige versie meteen mee: het tegoed werd altijd met exact 1
--     verlaagd (een sessie van 90 min kost sinds 0117 1,5 beurt) en v_bal was int terwijl
--     saldi numeric zijn (1,5 werd naar 2 afgerond bij de controle).
--
-- OPRUIMING: er stonden TWEE overloads van admin_create_booking (een dode 5-arg-versie met
-- p_hour integer uit een oude migratie, die bovendien price_cents én paid=true zette — dus
-- een betaalde sessie zonder betaling). De app roept enkel de 6-arg-versie aan (geverifieerd:
-- één callsite in app/beheer/actions.js). Beide worden vervangen door één functie, zodat
-- PostgREST nooit de verkeerde kan kiezen.
--
-- GEEN backfill op de bestaande ±9 gratis sessies — dat is live data en een owner-beslissing.
-- De financiënsectie toont ze met "reden niet vastgelegd".

alter table bookings add column if not exists comp_reason      text;
alter table bookings add column if not exists comp_value_cents int;
alter table bookings add column if not exists comped_by        uuid references profiles(id);
alter table bookings add column if not exists balie_charge     boolean not null default false;

comment on column bookings.comp_reason      is 'Waarom deze sessie gratis is gegeven (verplicht bij een gratis beheer-boeking).';
comment on column bookings.comp_value_cents is 'Lijstprijs die is kwijtgescholden — voedt het overzicht in /beheer/financien.';
comment on column bookings.comped_by        is 'Welke beheerder de sessie gratis gaf.';
comment on column bookings.balie_charge     is 'Beheer plande dit in, het lid betaalt ter plaatse. Krijgt wél een deurcode (bewuste staff-beslissing), staat bij Onbetaald tot het geld binnen is.';

create index if not exists bookings_comp_idx on bookings(gym_id, starts_at) where comp_reason is not null;

drop function if exists public.admin_create_booking(uuid, uuid, date, integer, integer);
drop function if exists public.admin_create_booking(uuid, uuid, date, numeric, integer, boolean);

create or replace function public.admin_create_booking(
  p_member uuid, p_service uuid, p_date date, p_hour numeric, p_persons integer default 1,
  p_use_credit boolean default false, p_mode text default null, p_comp_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_gym uuid; v_srv services%rowtype; v_start timestamptz; v_end timestamptz; v_id uuid;
  v_bal numeric; v_source payment_source; v_hours numeric; v_price int; v_paid boolean;
  v_list int; v_mode text; v_reason text;
begin
  if not is_beheerder() then raise exception 'Alleen beheerder.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;

  -- Oude aanroep met p_use_credit = true blijft werken. "Niets gekozen" is bewust GEEN gratis
  -- sessie meer: dat vraagt expliciet p_mode = 'gratis' plus een reden.
  v_mode := coalesce(nullif(p_mode, ''), case when p_use_credit then 'credit' end);
  if v_mode is null then
    raise exception 'Kies hoe deze sessie betaald wordt: van het tegoed, te betalen, of gratis met reden.' using errcode='P0001';
  end if;
  if v_mode not in ('credit', 'charge', 'gratis') then
    raise exception 'Ongeldige betaalwijze.' using errcode='P0001';
  end if;
  v_reason := nullif(btrim(coalesce(p_comp_reason, '')), '');
  if v_mode = 'gratis' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'Geef een reden op waarom deze sessie gratis is.' using errcode='P0001';
  end if;

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

  -- Duur in beurten (0117: halve beurten bestaan) — 60 min = 1, 90 min = 1,5.
  v_hours := greatest(0.5, round((v_srv.duration_min / 60.0) * 2) / 2);
  -- Lijstprijs: abonnee betaalt het ledentarief, anders het losse tarief. Dit is ook de waarde
  -- die we bij een gratis sessie noteren, zodat "wat gaven we weg" een eerlijk cijfer is.
  v_list := round(coalesce(
    case when has_active_membership(p_member) then v_srv.member_price_cents end,
    v_srv.price_cents) * v_hours);

  if v_mode = 'credit' then
    perform pg_advisory_xact_lock(hashtext('credits:' || p_member::text));
    v_bal := public.credits_balance(p_member);
    if v_bal < v_hours then
      raise exception 'Dit lid heeft nog % beurt(en); deze sessie kost er %. Kies "te betalen" of "gratis met reden".', v_bal, v_hours using errcode='P0001';
    end if;
    v_source := 'credit'; v_price := 0; v_paid := true;
  elsif v_mode = 'charge' then
    v_source := 'los'; v_price := v_list; v_paid := false;   -- verschijnt bij "Onbetaald"
  else
    v_source := 'los'; v_price := 0; v_paid := true;         -- bewust gratis, mét reden
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, starts_at, ends_at, persons, payment_source, price_cents, paid,
                          comp_reason, comp_value_cents, comped_by, balie_charge)
    values (v_gym, v_srv.id, p_member, v_start, v_end, p_persons, v_source, v_price, v_paid,
            case when v_mode = 'gratis' then v_reason end,
            case when v_mode = 'gratis' then v_list end,
            case when v_mode = 'gratis' then auth.uid() end,
            v_mode = 'charge')
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if v_mode = 'credit' then
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id) values (v_gym, p_member, -v_hours, 'gebruik', v_id);
  end if;
  return v_id;
end; $function$;
grant execute on function public.admin_create_booking(uuid, uuid, date, numeric, integer, boolean, text, text) to authenticated;
