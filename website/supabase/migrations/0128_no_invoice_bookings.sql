-- 0128 — Boeken op factuur bestaat niet meer. Elke coach betaalt vooraf, per sessie.
--
-- 0124 zette een rem op factuur-coaches (blokkeren zodra er iets openstaat). De owner wil verder:
-- "hij moet alles betalen en alles afrekenen en dan kan hij verder boeken maar moet bij elke sessie
-- betalen — zorg dat daar niet zomaar kan omzeild worden zonder te betalen."
--
-- Daarom valt de factuur-tak hier volledig weg. Staat een coach nog op modus 'invoice', dan wordt
-- hij behandeld als 'credit': boeken kan enkel met vooraf gekocht tegoed. Zo is er geen enkele
-- combinatie van instellingen meer waarmee je een sessie krijgt zonder betaald te hebben.
--
-- WAT DIT NIET DOET: bestaande boekingen behouden hun coach_billing = 'invoice' en hun
-- coach_charge_cents. Het wegpoetsen van dat label zou de boekhouding vervalsen.
--
-- STAND BIJ HET TOEPASSEN (2026-08-07, ná de omzetting van die avond): de openstaande
-- factuursessies zijn omgezet naar NEGATIEF SESSIETEGOED (Jan Matthys −8, TDW −5) en afgevinkt met
-- coach_invoiced_at; de onbetaalde post van Thomas is kwijtgescholden. De v_owed-controle hieronder
-- vindt dus overal 0 en blokkeert niemand onterecht. Ze blijft staan als tweede slot, mocht er ooit
-- nog een onbetaalde coach_credits-post ontstaan — schuld hoort nooit onzichtbaar te kunnen worden.
-- Wie in de min staat, wordt hoe dan ook tegengehouden door de saldocontrole verderop.
--
-- AUDIT (2026-08-06) — er is precies één pad dat coach_billing zet, en dat is deze functie:
--   • create_booking (publieke /boeken): zet géén coach_billing; een coach betaalt daar het
--     lidtarief van € 12 via Stripe. Geen omweg.
--   • admin_create_booking: zet géén coach_billing.
--   • los boeken én reeks-boeken op het coachdashboard: gaan allebei via coach_book_session.
-- 'free' blijft bestaan: dat is een bewuste afspraak met de gym, geen krediet.

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
  v_user uuid; v_start timestamptz; v_end timestamptz; v_id uuid; v_billing text; v_charge int; v_cbal int;
  v_lbal numeric;
  v_hours numeric := coalesce(p_hours, 1);
  v_owed_sessions int; v_owed_invoices int; v_owed int;
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
  else
    -- Alles behalve 'free' loopt via vooraf gekocht tegoed — óók een coach die nog op de oude
    -- modus 'invoice' staat. Boeken zonder betaald te hebben kan dus niet meer.
    -- Wie nog iets openstaan heeft van vroeger, moet dat eerst aanzuiveren: die som blokkeert
    -- hier apart, zodat een aankoop van nieuw tegoed geen oude schuld verbergt.
    perform pg_advisory_xact_lock(hashtext('coach_invoice:' || v_coach::text));
    select coalesce(sum(coach_charge_cents), 0) into v_owed_sessions
      from bookings
     where coach_id = v_coach and coach_billing = 'invoice'
       and status = 'bevestigd' and coach_invoiced_at is null;
    select coalesce(sum(amount_cents), 0) into v_owed_invoices
      from payments
     where user_id = v_coach and status = 'onbetaald' and kind = 'coach_credits';
    v_owed := v_owed_sessions + v_owed_invoices;
    if v_owed > 0 then
      raise exception 'Je hebt nog € % openstaan bij de gym. Zuiver dat eerst aan — daarna kan je weer boeken met sessietegoed.',
        to_char(round(v_owed / 100.0, 2), 'FM999999990.00') using errcode='P0001';
    end if;

    perform pg_advisory_xact_lock(hashtext('coach_ledger:' || v_coach::text));
    select coalesce(sum(delta), 0) into v_lbal from coach_ledger where coach_id = v_coach;
    if v_lbal < v_hours then
      raise exception 'Onvoldoende sessietegoed (saldo: %, nodig: %). Koop eerst tegoed bij — elke sessie wordt vooraf betaald.', v_lbal, v_hours using errcode='P0001';
    end if;
    v_billing := 'credit'; v_charge := 0;
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
