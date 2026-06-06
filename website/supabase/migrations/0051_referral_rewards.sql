-- 0051: friend-invite rewards on activation.
--   Invitee (the new friend) gets 1 free session credit, booked straight into their account.
--   Inviter gets a scoreboard point — counted on the leaderboard from rewarded referrals (no cash/credit).
create or replace function public.reward_pending_referral(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_gym uuid; v_referrer uuid;
begin
  select id, gym_id, referrer_id into v_id, v_gym, v_referrer
    from referrals where referred_id = p_user and status = 'pending' limit 1;
  if v_id is null then return; end if;
  update referrals set status = 'rewarded', rewarded_at = now() where id = v_id;
  -- The new friend gets a free session as real credit (one-time, on activation).
  insert into credits_ledger (gym_id, user_id, delta, reason) values (v_gym, p_user, 1, 'referral_welcome');
  -- The inviter's reward is a leaderboard point (see referral_points), so no credit here.
end; $$;
grant execute on function public.reward_pending_referral(uuid) to authenticated, service_role;

-- Rewarded referrals per user this month — used as bonus "points" on the leaderboard.
create or replace function public.referral_points(p_gym uuid, p_since timestamptz)
returns table (referrer_id uuid, points int)
language sql stable security definer set search_path = public as $$
  select referrer_id, count(*)::int as points
  from referrals
  where gym_id = p_gym and status = 'rewarded' and rewarded_at >= p_since
  group by referrer_id;
$$;
grant execute on function public.referral_points(uuid, timestamptz) to anon, authenticated;
