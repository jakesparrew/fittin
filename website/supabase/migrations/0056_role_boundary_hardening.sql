-- 0056: role-boundary & access-control hardening (audit juni 2026)
--   • beheerder-only DB enforcement on admin RPCs (defence-in-depth; the server actions are
--     also being gated with requireStaff(true)) so a coach calling the RPC directly is blocked.
--   • coach_book_session may only book for the coach's OWN clients, respects slot blocks and
--     the service capacity, and is covered by the new overlap exclusion constraint.
--   • respond_join_request: a security-definer path so an invitee can actually accept/decline a
--     "come train with me" request (the old code called an owner-only RPC as the invitee → dead).
--   • search_members: a narrow security-definer search (id + name, same gym) replaces a
--     service-role query that bypassed RLS and exposed every member to any logged-in user.
--   • Stop exposing the full profiles row (email/phone/stripe_customer_id) to anonymous clients:
--     the public /coaches pages read coach data via the service-role client, so the broad anon
--     SELECT policy is unnecessary and is dropped.

-- ── beheerder helper ────────────────────────────────────────────────────────────────
create or replace function public.is_beheerder()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'beheerder' from profiles where id = auth.uid()), false);
$$;

-- ── admin RPCs: require beheerder (not just any staff) ────────────────────────────────
create or replace function public.admin_block_slot(p_date date, p_hour int, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid; v_slot int; v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  if not is_beheerder() then raise exception 'Alleen beheerder.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  select slot_minutes into v_slot from gyms where id = v_gym;
  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => coalesce(v_slot,75));
  insert into slot_blocks (gym_id, starts_at, ends_at, reason, created_by)
  values (v_gym, v_start, v_end, p_reason, auth.uid()) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.admin_block_slot(date, int, text) to authenticated;

create or replace function public.admin_create_booking(
  p_member uuid, p_service uuid, p_date date, p_hour int, p_persons int default 1, p_use_credit boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid; v_srv services%rowtype; v_start timestamptz; v_end timestamptz; v_id uuid; v_bal int; v_source payment_source;
begin
  if not is_beheerder() then raise exception 'Alleen beheerder.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  if not exists (select 1 from profiles where id = p_member and gym_id = v_gym) then
    raise exception 'Lid niet gevonden.' using errcode='P0001';
  end if;
  select * into v_srv from services where id = p_service and gym_id = v_gym;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;
  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);
  if exists (select 1 from slot_blocks sb where sb.gym_id = v_gym
              and tstzrange(sb.starts_at, sb.starts_at + interval '1 hour') && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is geblokkeerd.' using errcode='P0001';
  end if;

  if p_use_credit then
    select coalesce(sum(delta), 0) into v_bal from credits_ledger
      where user_id = p_member and (expires_at is null or expires_at > now());
    if v_bal < 1 then raise exception 'Dit lid heeft onvoldoende sessies.' using errcode='P0001'; end if;
    v_source := 'credit';
  else
    v_source := 'los';  -- admin comp (free)
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, starts_at, ends_at, persons, payment_source, price_cents, paid)
    values (v_gym, v_srv.id, p_member, v_start, v_end, p_persons, v_source, 0, true)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if p_use_credit then
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id) values (v_gym, p_member, -1, 'gebruik', v_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.admin_create_booking(uuid, uuid, date, int, int, boolean) to authenticated;

create or replace function public.admin_adjust_credits(p_member uuid, p_delta int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_gym uuid;
begin
  if not is_beheerder() then raise exception 'Alleen beheerder.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  if not exists (select 1 from profiles where id = p_member and gym_id = v_gym) then
    raise exception 'Lid niet gevonden.' using errcode='P0001';
  end if;
  insert into credits_ledger (gym_id, user_id, delta, reason)
  values (v_gym, p_member, p_delta, coalesce(p_reason, 'correctie'));
end; $$;
grant execute on function public.admin_adjust_credits(uuid, int, text) to authenticated;

-- ── coach_book_session: own-client only + slot blocks + capacity + overlap-safe ──────
drop function if exists public.coach_book_session(uuid, uuid, date, int, int, boolean);
create or replace function public.coach_book_session(
  p_client uuid, p_service uuid, p_date date, p_hour int, p_persons int default 1, p_use_client_credit boolean default false
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
  if not exists (select 1 from profiles where id = p_client and gym_id = v_gym) then
    raise exception 'Onbekende client.' using errcode='P0001'; end if;
  -- A coach books only for their OWN clients; a beheerder may book for anyone in the gym.
  if v_role = 'coach' and not exists (
    select 1 from coach_clients where coach_id = v_coach and client_id = p_client and gym_id = v_gym
  ) then raise exception 'Dit is niet jouw client.' using errcode='P0001'; end if;

  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;
  if exists (select 1 from slot_blocks sb where sb.gym_id = v_gym
              and tstzrange(sb.starts_at, sb.starts_at + interval '1 hour') && tstzrange(v_start, v_end)) then
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
grant execute on function public.coach_book_session(uuid, uuid, date, int, int, boolean) to authenticated;

-- ── respond_join_request: invitee accepts/declines a "come train with me" request ───
create or replace function public.respond_join_request(p_request uuid, p_accept boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_gym uuid; v_booking uuid; v_to uuid; v_status text;
  v_persons int; v_cap int; v_have int;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id, booking_id, to_user, status into v_gym, v_booking, v_to, v_status
    from booking_join_requests where id = p_request;
  if v_to is null or v_to <> v_uid then raise exception 'Geen toegang tot dit verzoek.' using errcode='P0001'; end if;
  if v_status <> 'pending' then return false; end if;

  if not p_accept then
    update booking_join_requests set status = 'declined' where id = p_request;
    return false;
  end if;

  select persons into v_persons from bookings where id = v_booking and status = 'bevestigd';
  if v_persons is null then
    update booking_join_requests set status = 'declined' where id = p_request;
    return false;
  end if;
  v_cap := greatest(0, coalesce(v_persons, 1) - 1);
  select count(*) into v_have from booking_participants where booking_id = v_booking;
  if v_have >= v_cap then
    update booking_join_requests set status = 'declined' where id = p_request;
    return false;
  end if;

  insert into booking_participants (gym_id, booking_id, user_id)
  values (v_gym, v_booking, v_uid) on conflict (booking_id, user_id) do nothing;
  update booking_join_requests set status = 'accepted' where id = p_request;
  return true;
end; $$;
grant execute on function public.respond_join_request(uuid, boolean) to authenticated;

-- ── search_members: narrow same-gym member lookup (id + name only), RLS-safe ─────────
create or replace function public.search_members(p_q text)
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from profiles p
  where p.gym_id = (select gym_id from profiles where id = auth.uid())
    and p.id <> auth.uid()
    and auth.uid() is not null
    and (coalesce(p_q, '') = '' or p.full_name ilike '%' || p_q || '%')
  order by p.full_name
  limit 8;
$$;
grant execute on function public.search_members(text) to authenticated;

-- ── stop exposing the full profiles row to anonymous clients ─────────────────────────
-- Public coach data is served via the service-role client (lib/cache.js + /coaches pages),
-- so anon never needs to read profiles directly. Removing this policy closes the leak of
-- email / phone / stripe_customer_id to anyone holding the public anon key.
drop policy if exists profiles_public_coaches on profiles;
