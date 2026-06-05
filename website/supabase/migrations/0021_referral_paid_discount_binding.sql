-- 0021: (1) referrer reward only fires on the referred member's FIRST PAID action (kills farming
-- with throwaway non-paying accounts). (2) discount codes can be bound to one member (per-recipient).

-- (2) bind a code to a specific member; null = open code.
alter table discount_codes add column if not exists user_id uuid references profiles(id) on delete cascade;

-- (1a) redeem now records 'pending' and credits only the NEW member; the referrer is paid later.
create or replace function public.redeem_referral(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid; v_referrer uuid; v_created timestamptz;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id, created_at into v_gym, v_created from profiles where id = v_uid;
  if exists (select 1 from referrals where referred_id = v_uid) then
    raise exception 'Je hebt al een code gebruikt.' using errcode='P0001';
  end if;
  if exists (select 1 from bookings where user_id = v_uid) then
    raise exception 'Een vriendcode geldt enkel voor nieuwe leden die nog niet boekten.' using errcode='P0001';
  end if;
  if v_created < now() - interval '21 days' then
    raise exception 'Vriendcodes zijn enkel geldig in je eerste weken bij Fittin''.' using errcode='P0001';
  end if;
  select id into v_referrer from profiles where upper(referral_code) = upper(p_code) and gym_id = v_gym;
  if v_referrer is null then raise exception 'Onbekende code.' using errcode='P0001'; end if;
  if v_referrer = v_uid then raise exception 'Je eigen code telt niet.' using errcode='P0001'; end if;

  insert into referrals (gym_id, referrer_id, referred_id, status)
  values (v_gym, v_referrer, v_uid, 'pending');
  -- New member gets their welcome credit now (incentive to join).
  insert into credits_ledger (gym_id, user_id, delta, reason) values (v_gym, v_uid, 1, 'referral');
  return 'ok';
end; $$;

-- (1b) reward the referrer once the referred member actually pays (idempotent, cap 10/30d).
create or replace function public.reward_pending_referral(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_gym uuid; v_referrer uuid; v_recent int;
begin
  select id, gym_id, referrer_id into v_id, v_gym, v_referrer
    from referrals where referred_id = p_user and status = 'pending' limit 1;
  if v_id is null then return; end if;
  update referrals set status = 'rewarded', rewarded_at = now() where id = v_id;
  select count(*) into v_recent from referrals
    where referrer_id = v_referrer and status = 'rewarded' and rewarded_at > now() - interval '30 days';
  if v_recent <= 10 then
    insert into credits_ledger (gym_id, user_id, delta, reason) values (v_gym, v_referrer, 1, 'referral');
  end if;
end; $$;
grant execute on function public.reward_pending_referral(uuid) to authenticated, service_role;
