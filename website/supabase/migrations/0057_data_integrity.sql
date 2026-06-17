-- 0057: data-integrity fixes (audit juni 2026)
--   • Refund the member's session credit(s) when a credit-paid booking is cancelled.
--   • Referred friend gets exactly ONE free session (was 2: one at redeem + one at activation).
--   • Atomic event seat reservation so a paid event can no longer be oversold by concurrent
--     checkouts (counts paid + fresh holds; abandoned holds free up after 30 min).

-- ── refund member session credit on cancel ──────────────────────────────────────────
-- create_booking debits N credits (one per booked hour) with reason 'gebruik' ref_id=booking.
-- On cancel of a credit-paid booking, give them back (once). The cancel paths already enforce
-- the 24h window (member) or are an intentional admin/coach comp, so no extra window check here.
create or replace function public.refund_member_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hours int;
begin
  if new.status = 'geannuleerd' and old.status <> 'geannuleerd' and new.payment_source = 'credit' then
    if not exists (select 1 from credits_ledger where ref_id = new.id and reason = 'refund') then
      v_hours := greatest(1, round(extract(epoch from (new.ends_at - new.starts_at)) / 3600.0)::int);
      insert into credits_ledger (gym_id, user_id, delta, reason, ref_id)
      values (new.gym_id, new.user_id, v_hours, 'refund', new.id);
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists refund_member_credit_after on bookings;
create trigger refund_member_credit_after after update on bookings
  for each row execute function public.refund_member_credit();

-- ── referral: friend gets exactly one free session ──────────────────────────────────
-- redeem_referral (0021) already grants the new friend +1 'referral' at redeem. Drop the
-- duplicate +1 'referral_welcome' here; keep marking the referral rewarded so the inviter
-- still earns their leaderboard point (referral_points counts rewarded referrals).
create or replace function public.reward_pending_referral(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from referrals where referred_id = p_user and status = 'pending' limit 1;
  if v_id is null then return; end if;
  update referrals set status = 'rewarded', rewarded_at = now() where id = v_id;
  -- New friend's free session was already granted at redeem (reason 'referral'); no second credit.
  -- Inviter's reward is a leaderboard point (referral_points), so no credit here either.
end; $$;
grant execute on function public.reward_pending_referral(uuid) to authenticated, service_role;

-- ── atomic event seat reservation (no oversell) ─────────────────────────────────────
-- Returns the caller's signup id (reused if they already hold a pending seat). Serialises
-- per event with an advisory lock; counts paid signups + still-fresh unpaid holds (≤30 min).
create or replace function public.reserve_event_seat(p_event uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_gym uuid; v_cap int; v_status text; v_start timestamptz;
  v_taken int; v_id uuid; v_existing uuid; v_existing_paid boolean;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id, capacity, status, starts_at into v_gym, v_cap, v_status, v_start from events where id = p_event;
  if v_gym is null or v_status <> 'approved' then raise exception 'Event niet gevonden.' using errcode='P0001'; end if;
  if v_start < now() then raise exception 'Dit event is al geweest.' using errcode='P0001'; end if;

  select id, paid into v_existing, v_existing_paid from event_signups where event_id = p_event and user_id = v_uid;
  if coalesce(v_existing_paid, false) then raise exception 'Je bent al ingeschreven.' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event::text, 0));
  select count(*) into v_taken from event_signups
    where event_id = p_event and user_id <> v_uid
      and (paid = true or created_at > now() - interval '30 minutes');
  if v_taken >= coalesce(v_cap, 0) then raise exception 'Dit event is volzet.' using errcode='P0001'; end if;

  if v_existing is not null then
    update event_signups set created_at = now() where id = v_existing;  -- refresh the hold
    return v_existing;
  end if;
  insert into event_signups (gym_id, event_id, user_id, paid) values (v_gym, p_event, v_uid, false) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.reserve_event_seat(uuid) to authenticated;
