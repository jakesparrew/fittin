-- 0084_launch_hardening.sql — pre-launch fixes from the launch-readiness audit.
--   1) BLOCKER: unpaid 'abo' bookings could open the door / mint a Nuki code before the EUR 12 was paid.
--      The door must only admit bookings settled at creation (paid, or credit/gratis_code).
--   2) coach_book_session must only book ACCEPTED clients (not pending/forged links).
--   3) coach_clients direct writes locked to beheerder; coaches link only via the connect RPCs.
--   4) set_client_price RPC (coaches can no longer write coach_clients directly).
--   5) expire_unpaid_bookings also releases abandoned unpaid 'abo' holds.
--   6) coach_payment_requests insert requires an accepted client.

-- 1) Door only opens for settled bookings. 'los' and 'abo' are paid=false until Stripe confirms;
--    credit/gratis_code are settled at creation; coach/admin bookings are inserted paid=true.
create or replace function public.open_door()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid;
  v_booking uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = v_uid;

  select id into v_booking from bookings
  where user_id = v_uid and status = 'bevestigd'
    and (paid or payment_source in ('credit', 'gratis_code'))   -- unpaid los/abo cannot open the door
    and now() >= starts_at - interval '5 minutes' and now() <= ends_at
  order by starts_at limit 1;

  if v_booking is null then
    insert into door_log (gym_id, user_id, result) values (v_gym, v_uid, 'denied');
    raise exception 'Je hebt nu geen actieve (betaalde) boeking.' using errcode='P0001';
  end if;

  insert into door_log (gym_id, user_id, booking_id, result) values (v_gym, v_uid, v_booking, 'ok');
  return 'open';
end; $$;

-- 5) Release abandoned unpaid holds for BOTH 'los' and 'abo' (was 'los' only).
create or replace function public.expire_unpaid_bookings(p_gym uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with x as (
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where status = 'bevestigd' and paid = false and price_cents > 0
      and payment_source in ('los', 'abo')
      and created_at < now() - interval '20 minutes'
      and (p_gym is null or gym_id = p_gym)
    returning id, gym_id, user_id
  ),
  ins as (
    insert into notifications (gym_id, user_id, type, title, body, link)
    select x.gym_id, x.user_id, 'system',
           'Je onbetaalde boeking is verlopen',
           'De plek is weer vrijgegeven omdat de betaling niet binnen 20 minuten binnenkwam. Boek gerust opnieuw.',
           '/boeken'
    from x
    returning 1
  )
  select count(*) into n from x;
  return n;
end; $$;
grant execute on function public.expire_unpaid_bookings(uuid) to authenticated, service_role;

-- 2) coach_book_session: only book an ACCEPTED client link (recreated from 0076 with the status guard).
create or replace function public.coach_book_session(
  p_client uuid, p_service uuid, p_date date, p_hour numeric, p_persons int default 1, p_use_client_credit boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_gym uuid; v_role user_role; v_mode text; v_price int;
  v_srv services%rowtype; v_open int; v_close int;
  v_start timestamptz; v_end timestamptz; v_id uuid; v_bal int; v_billing text; v_charge int; v_cbal int;
begin
  select gym_id, role, coach_billing_mode, coach_session_price_cents
    into v_gym, v_role, v_mode, v_price from profiles where id = v_coach;
  if v_role not in ('coach', 'beheerder') then raise exception 'Alleen coaches kunnen dit.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  if not exists (select 1 from profiles where id = p_client and gym_id = v_gym) then
    raise exception 'Onbekende client.' using errcode='P0001'; end if;
  if v_role = 'coach' and not exists (
    select 1 from coach_clients where coach_id = v_coach and client_id = p_client and gym_id = v_gym and status = 'accepted'
  ) then raise exception 'Dit is niet jouw (verbonden) client.' using errcode='P0001'; end if;

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

  if p_use_client_credit then
    select coalesce(sum(delta), 0) into v_cbal from coach_credit_ledger where coach_id = v_coach and client_id = p_client;
    if v_cbal < 1 then raise exception 'Deze client heeft geen sessietegoed bij jou.' using errcode='P0001'; end if;
  end if;

  if v_mode = 'free' then
    v_billing := 'free'; v_charge := 0;
  elsif v_mode = 'credit' then
    select coalesce(sum(delta), 0) into v_bal from coach_ledger where coach_id = v_coach;
    if v_bal < 1 then raise exception 'Onvoldoende coach-sessies. Koop er bij of vraag de beheerder.' using errcode='P0001'; end if;
    v_billing := 'credit'; v_charge := 0;
  else
    v_billing := 'invoice'; v_charge := coalesce(v_price, 0);
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid, coach_billing, coach_charge_cents)
    values (v_gym, v_srv.id, p_client, v_coach, v_start, v_end, p_persons, 'los', 0, true, v_billing, v_charge)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if v_billing = 'credit' then
    insert into coach_ledger (gym_id, coach_id, delta, reason, ref_id) values (v_gym, v_coach, -1, 'sessie', v_id);
  end if;
  if p_use_client_credit then
    insert into coach_credit_ledger (gym_id, coach_id, client_id, delta, reason, ref_id) values (v_gym, v_coach, p_client, -1, 'sessie', v_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.coach_book_session(uuid, uuid, date, numeric, int, boolean) to authenticated;

-- 3) Lock direct coach_clients writes to beheerder only. Coaches/members link exclusively via the
--    connect RPCs (coach_request_client / client_request_coach / respond_coach_link / remove_coach_link),
--    which are SECURITY DEFINER and bypass RLS. Admin assignCoachClient runs as a beheerder (passes here);
--    coachCreateClient uses the service-role client (bypasses RLS).
drop policy if exists coach_clients_write on coach_clients;
create policy coach_clients_write on coach_clients for all
  using (gym_id = current_gym_id() and is_beheerder())
  with check (gym_id = current_gym_id() and is_beheerder());

-- 4) Coach sets a per-client price note via RPC (own ACCEPTED client only).
create or replace function public.set_client_price(p_client uuid, p_price int)
returns void language plpgsql security definer set search_path = public as $$
declare v_coach uuid := auth.uid();
begin
  if p_price is null or p_price < 0 then raise exception 'Ongeldig tarief.' using errcode='P0001'; end if;
  update coach_clients set price_cents = p_price
   where coach_id = v_coach and client_id = p_client and status = 'accepted';
  if not found then raise exception 'Geen verbonden client.' using errcode='P0001'; end if;
end; $$;
grant execute on function public.set_client_price(uuid, int) to authenticated;

-- 6) A coach can only raise a payment request for an ACCEPTED client (was: any client in the gym).
drop policy if exists cpr_insert on coach_payment_requests;
create policy cpr_insert on coach_payment_requests for insert
  with check (
    coach_id = auth.uid() and gym_id = current_gym_id()
    and exists (select 1 from coach_clients cc
                where cc.coach_id = auth.uid() and cc.client_id = coach_payment_requests.client_id
                  and cc.status = 'accepted')
  );
