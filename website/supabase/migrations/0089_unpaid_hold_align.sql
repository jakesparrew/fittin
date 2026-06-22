-- 0089_unpaid_hold_align.sql
-- Close the go-live payment RACE: a Stripe Checkout session (now capped at ~32 min via expires_at)
-- could previously outlive the 20-min unpaid-slot hold, so a slow payment (SCA/Bancontact/bank-app)
-- landing after expiry charged the member onto a cancelled/re-booked slot. Make the hold (35 min)
-- OUTLAST the payable window (32 min) so a still-payable session always has a live slot hold.
-- Recreated verbatim from 0022 except the interval 20 → 35 minutes (both the sweep + the trigger).
create or replace function public.expire_unpaid_bookings(p_gym uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with x as (
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where status = 'bevestigd' and paid = false and price_cents > 0 and payment_source = 'los'
      and created_at < now() - interval '35 minutes'
      and (p_gym is null or gym_id = p_gym)
    returning 1
  ) select count(*) into n from x;
  return n;
end; $$;
grant execute on function public.expire_unpaid_bookings(uuid) to authenticated, service_role;

create or replace function public.free_expired_slot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'bevestigd' then
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where gym_id = new.gym_id and starts_at = new.starts_at and status = 'bevestigd'
      and paid = false and price_cents > 0 and payment_source = 'los'
      and created_at < now() - interval '35 minutes';
  end if;
  return new;
end; $$;
drop trigger if exists free_expired_slot_before on bookings;
create trigger free_expired_slot_before before insert on bookings
  for each row execute function public.free_expired_slot();
