-- 0022: abandoned unpaid bookings must not hold a slot forever. A 'los' booking that's created
-- but never paid expires after 20 minutes and frees the slot for everyone.

-- Cleanup (called on page loads + cron): cancel unpaid 'los' bookings older than 20 min.
create or replace function public.expire_unpaid_bookings(p_gym uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with x as (
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where status = 'bevestigd' and paid = false and price_cents > 0 and payment_source = 'los'
      and created_at < now() - interval '20 minutes'
      and (p_gym is null or gym_id = p_gym)
    returning 1
  ) select count(*) into n from x;
  return n;
end; $$;
grant execute on function public.expire_unpaid_bookings(uuid) to authenticated, service_role;

-- Belt-and-suspenders: when ANY new confirmed booking is inserted, first release an expired-unpaid
-- booking sitting on the exact same slot — so create_booking / coach_book_session / admin booking
-- can all reclaim a slot whose only holder is a dead unpaid booking.
create or replace function public.free_expired_slot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'bevestigd' then
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where gym_id = new.gym_id and starts_at = new.starts_at and status = 'bevestigd'
      and paid = false and price_cents > 0 and payment_source = 'los'
      and created_at < now() - interval '20 minutes';
  end if;
  return new;
end; $$;
drop trigger if exists free_expired_slot_before on bookings;
create trigger free_expired_slot_before before insert on bookings
  for each row execute function public.free_expired_slot();
