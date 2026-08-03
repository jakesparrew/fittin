-- 0120 — "Te betalen aan de balie" weer weg uit admin_create_booking.
--
-- 0119 introduceerde drie modi. De derde ('charge') bleek op twee punten fout:
--  1) Er IS geen balie — de gym is onbemand (zie de noodinstructies in de toegangsmail).
--     De term beloofde een betaalmoment dat fysiek niet bestaat.
--  2) Fataal: expire_unpaid_bookings annuleert ELKE onbetaalde 'los'-boeking met prijs > 0
--     na 35 minuten. Een "te betalen"-boeking zou dus vanzelf verdwijnen nog vóór het lid
--     iets kon betalen — een stille annulatie, precies het soort verrassing dat we uitroeien.
--
-- Er blijven twee eerlijke keuzes over, en die dekken de praktijk volledig:
--   'credit' → van het sessietegoed van het lid (standaard)
--   'gratis' → bewust weggegeven, mét verplichte reden
-- Wil een lid zelf betalen, dan boekt het gewoon via /boeken (daar loopt de Stripe-flow).
--
-- balie_charge blijft als kolom bestaan (additief, altijd false) — geen destructieve ops op
-- live data; hij is simpelweg onbereikbaar geworden.

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

  v_mode := coalesce(nullif(p_mode, ''), case when p_use_credit then 'credit' end);
  if v_mode is null then
    raise exception 'Kies hoe deze sessie betaald wordt: van het tegoed, of gratis met reden.' using errcode='P0001';
  end if;
  if v_mode not in ('credit', 'gratis') then
    raise exception 'Ongeldige betaalwijze. Kies "van het tegoed" of "gratis met reden".' using errcode='P0001';
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

  -- Duur in beurten (0117): 60 min = 1, 90 min = 1,5.
  v_hours := greatest(0.5, round((v_srv.duration_min / 60.0) * 2) / 2);
  v_list := round(coalesce(
    case when has_active_membership(p_member) then v_srv.member_price_cents end,
    v_srv.price_cents) * v_hours);

  if v_mode = 'credit' then
    perform pg_advisory_xact_lock(hashtext('credits:' || p_member::text));
    v_bal := public.credits_balance(p_member);
    if v_bal < v_hours then
      raise exception 'Dit lid heeft nog % beurt(en); deze sessie kost er %. Laat het lid zelf boeken via de site, of kies "gratis met reden".', v_bal, v_hours using errcode='P0001';
    end if;
    v_source := 'credit'; v_price := 0; v_paid := true;
  else
    v_source := 'los'; v_price := 0; v_paid := true;         -- bewust gratis, mét reden
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, starts_at, ends_at, persons, payment_source, price_cents, paid,
                          comp_reason, comp_value_cents, comped_by)
    values (v_gym, v_srv.id, p_member, v_start, v_end, p_persons, v_source, v_price, v_paid,
            case when v_mode = 'gratis' then v_reason end,
            case when v_mode = 'gratis' then v_list end,
            case when v_mode = 'gratis' then auth.uid() end)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if v_mode = 'credit' then
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id) values (v_gym, p_member, -v_hours, 'gebruik', v_id);
  end if;
  return v_id;
end; $function$;
