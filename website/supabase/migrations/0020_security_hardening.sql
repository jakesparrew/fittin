-- 0020: security hardening from the self-audit.

-- (A) Discount double-redeem race: a per-user code could be redeemed twice under concurrency.
-- Enforce one redemption per (code, user) at the DB level. All our codes are per_user_once.
create unique index if not exists discount_redemptions_once on discount_redemptions(code_id, user_id);

-- (B) Referral farming: an attacker could spin up many throwaway "new" accounts that each redeem
-- their code, accumulating referral credits. Cap the *referrer* reward (the new account still gets
-- its credit). Max 10 rewarded referrals per referrer per rolling 30 days.
create or replace function public.redeem_referral(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid; v_referrer uuid; v_created timestamptz; v_recent int;
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

  insert into referrals (gym_id, referrer_id, referred_id, status, rewarded_at)
  values (v_gym, v_referrer, v_uid, 'rewarded', now());
  -- The new member always gets their credit.
  insert into credits_ledger (gym_id, user_id, delta, reason) values (v_gym, v_uid, 1, 'referral');
  -- The referrer gets rewarded only under the anti-farm cap.
  select count(*) into v_recent from referrals where referrer_id = v_referrer and rewarded_at > now() - interval '30 days';
  if v_recent <= 10 then
    insert into credits_ledger (gym_id, user_id, delta, reason) values (v_gym, v_referrer, 1, 'referral');
  end if;
  return 'ok';
end; $$;
