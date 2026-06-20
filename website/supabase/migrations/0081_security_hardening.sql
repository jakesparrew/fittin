-- 0081_security_hardening.sql
-- Security audit remediation (2026-06-20). Closes the highest-impact, exploitable findings:
--   HIGH-1  door + access codes granted to UNPAID bookings
--   HIGH-6  coach self-grants gym session credits (coach_ledger)
--   HIGH-7  coach mints member credits (credits_ledger)
--   MED-1   coach fabricates an active membership
--   (+ punch_cards)  coach mints punch-card credits
--   HIGH-8  coach creates a 100%-off discount code

-- ── HIGH-1: a booking only opens the door once it's actually paid (or non-cash: credit/abo/welcome) ──
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
    and (paid or payment_source <> 'los')           -- unpaid cash bookings cannot open the door
    and now() >= starts_at - interval '5 minutes' and now() <= ends_at
  order by starts_at limit 1;

  if v_booking is null then
    insert into door_log (gym_id, user_id, result) values (v_gym, v_uid, 'denied');
    raise exception 'Je hebt nu geen actieve (betaalde) boeking.' using errcode='P0001';
  end if;

  insert into door_log (gym_id, user_id, booking_id, result) values (v_gym, v_uid, v_booking, 'ok');
  return 'open';
end; $$;

-- ── HIGH-6/7, MED-1, punch_cards: money/state tables are written ONLY by SECURITY DEFINER RPCs
--    (create_booking, admin_adjust_credits, redeem_referral, award_challenges …) and the service-role
--    Stripe webhook — both bypass RLS. Strip all direct writes from the anon/authenticated roles so a
--    coach (is_staff) can no longer mint credits / memberships straight through PostgREST. ──
revoke insert, update, delete on credits_ledger from authenticated, anon;
revoke insert, update, delete on coach_ledger   from authenticated, anon;
revoke insert, update, delete on memberships    from authenticated, anon;
revoke insert, update, delete on punch_cards    from authenticated, anon;

drop policy if exists credits_insert_staff       on credits_ledger;
drop policy if exists coach_ledger_insert_staff  on coach_ledger;
drop policy if exists memberships_write_staff     on memberships;
drop policy if exists punch_cards_write_staff      on punch_cards;

-- ── HIGH-8: only a beheerder may create/modify discount codes (was is_staff → a coach could mint a
--    100%-off code and book for free). Redemption still runs via the service-role webhook. ──
drop policy if exists discount_codes_staff on discount_codes;
create policy discount_codes_admin on discount_codes for all
  using (gym_id = current_gym_id() and is_beheerder())
  with check (gym_id = current_gym_id() and is_beheerder());
