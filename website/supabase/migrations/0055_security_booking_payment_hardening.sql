-- 0055: CRITICAL security + data-integrity hardening (audit juni 2026)
-- Addresses the three critical audit findings:
--   C1  bookings_update RLS let a member flip paid/price_cents/payment_source on their own
--       booking via the public anon key → free bookings (Stripe payment bypass). Lock the
--       writable columns exactly like 0015 did for profiles.
--   C2  Overlapping multi-hour bookings were only blocked by a non-atomic EXISTS pre-check +
--       a same-start unique index → concurrent / admin / coach bookings could double-book the
--       exclusive private room. Enforce true range-exclusivity atomically at the DB level.
--   C3  The Stripe webhook could permanently lose granted credits on a transient handler
--       failure. Make the credit / punch-card / coach-ledger grants idempotent (stripe_ref)
--       so the route handler can safely DELETE the dedup lock and let Stripe retry.

-- ── C1: column-lock bookings ────────────────────────────────────────────────────────
-- Legitimate direct writes by an authenticated (RLS-bound) client:
--   cancel  → status, cancelled_at      (account/actions.js, beheer/actions.js)
--   checkout→ stripe_session_id         (boeken/actions.js)
-- paid / price_cents / payment_source / starts_at / user_id / … are written ONLY by
-- security-definer RPCs (run as owner) or the service-role webhook — both bypass these
-- column grants, so they keep working. A member can no longer self-confirm a booking.
revoke update on bookings from authenticated, anon;
grant update (status, cancelled_at, stripe_session_id) on bookings to authenticated;

drop policy if exists bookings_update on bookings;
create policy bookings_update on bookings for update
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()))
  with check (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));

-- ── C2: atomic exclusivity over the whole booked range ───────────────────────────────
-- NOTE: if legacy overlapping 'bevestigd' bookings already exist, this ALTER will fail.
--       Resolve/cancel the overlaps first (see the SELECT in the deploy notes) then re-run.
create extension if not exists btree_gist;
alter table bookings drop constraint if exists bookings_no_overlap;
alter table bookings add constraint bookings_no_overlap
  exclude using gist (gym_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status = 'bevestigd');

-- create_booking: surface the friendly message when the new exclusion constraint fires on a
-- concurrent race (the pre-check still covers the common, non-racing case). Body identical to
-- 0050 except the INSERT exception clause now also catches exclusion_violation.
create or replace function public.create_booking(
  p_service uuid, p_date date, p_hour int, p_persons int default 1,
  p_use_welcome boolean default false, p_coach uuid default null,
  p_use_credit boolean default false, p_hours int default 1
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid; v_used boolean; v_srv services%rowtype;
  v_open int; v_close int; v_start timestamptz; v_end timestamptz;
  v_free boolean; v_price int; v_base int; v_factor numeric; v_source payment_source; v_id uuid; v_bal int; v_member boolean;
  v_hours int := greatest(1, least(4, coalesce(p_hours, 1)));
  v_pt_price int;
  v_wstatus text;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn om te boeken.' using errcode='P0001'; end if;
  select gym_id, welcome_code_used, welcome_status into v_gym, v_used, v_wstatus from profiles where id = v_uid;
  if v_gym is null then raise exception 'Geen profiel gevonden.' using errcode='P0001'; end if;
  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_hours > v_close then raise exception 'De gekozen duur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(hours => v_hours);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

  if exists (select 1 from bookings b where b.gym_id = v_gym and b.status = 'bevestigd'
              and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is (deels) al geboekt. Kies een ander moment.' using errcode='P0001';
  end if;
  if exists (select 1 from slot_blocks sb where sb.gym_id = v_gym
              and tstzrange(sb.starts_at, sb.starts_at + interval '1 hour') && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is geblokkeerd.' using errcode='P0001';
  end if;

  -- FittinWelcome free session requires a verified card (welcome_status='eligible') — not just
  -- an unused flag — so a 'blocked' (card already farmed elsewhere) or 'unclaimed' user can't bypass.
  v_free := p_use_welcome and not coalesce(v_used, false) and v_wstatus = 'eligible'
            and v_srv.type = 'fit60' and v_hours = 1;
  v_member := has_active_membership(v_uid);
  v_factor := case when v_hours >= 4 then 0.90 when v_hours = 3 then 0.92 when v_hours = 2 then 0.95 else 1 end;

  if v_free then
    v_price := 0; v_source := 'gratis_code';
  elsif p_use_credit then
    select coalesce(sum(delta), 0) into v_bal from credits_ledger
      where user_id = v_uid and (expires_at is null or expires_at > now());
    if v_bal < v_hours then raise exception 'Onvoldoende sessies voor deze duur.' using errcode='P0001'; end if;
    v_price := 0; v_source := 'credit';
  elsif v_member and v_srv.member_price_cents is not null then
    v_base := v_srv.member_price_cents; v_price := round(v_base * v_hours * v_factor); v_source := 'abo';
  elsif v_srv.type = 'pt' and p_coach is not null then
    select coach_pt_price_cents into v_pt_price from profiles where id = p_coach;
    v_base := coalesce(v_pt_price, v_srv.price_cents); v_price := round(v_base * v_hours * v_factor); v_source := 'los';
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
end; $$;
grant execute on function public.create_booking(uuid, date, int, int, boolean, uuid, boolean, int) to authenticated;

-- ── C3: idempotent Stripe grants (the webhook can now safely retry) ──────────────────
-- A unique stripe_ref (Stripe session/invoice id) lets the same payment grant exactly once,
-- even if the handler is re-run. NULLs stay distinct, so existing rows are unaffected.
alter table credits_ledger     add column if not exists stripe_ref text;
alter table punch_cards        add column if not exists stripe_ref text;
alter table coach_ledger       add column if not exists stripe_ref text;
alter table coach_credit_ledger add column if not exists stripe_ref text;
create unique index if not exists credits_ledger_stripe_ref_key     on credits_ledger(stripe_ref);
create unique index if not exists punch_cards_stripe_ref_key        on punch_cards(stripe_ref);
create unique index if not exists coach_ledger_stripe_ref_key       on coach_ledger(stripe_ref);
create unique index if not exists coach_credit_ledger_stripe_ref_key on coach_credit_ledger(stripe_ref);
