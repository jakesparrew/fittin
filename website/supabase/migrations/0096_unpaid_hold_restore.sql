-- 0096_unpaid_hold_restore.sql
-- FIX (critical): migration 0089 recreated expire_unpaid_bookings "verbatim from 0022" and in doing
-- so silently reverted two improvements 0084 had added:
--   1) it swept ONLY payment_source='los', so an abandoned €12 'abo' checkout stays confirmed+unpaid
--      and blocks that revenue-bearing hour forever;
--   2) it dropped the member notification that the hold was released.
-- The trigger free_expired_slot had the same 'los'-only narrowing.
-- Restore both (abo + notification) while keeping 0089's correct 35-minute interval (which must stay
-- longer than the ~32-minute Stripe Checkout window so a still-payable session always holds its slot).

create or replace function public.expire_unpaid_bookings(p_gym uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with x as (
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where status = 'bevestigd' and paid = false and price_cents > 0
      and payment_source in ('los', 'abo')
      and created_at < now() - interval '35 minutes'
      and (p_gym is null or gym_id = p_gym)
    returning id, gym_id, user_id
  ),
  ins as (
    insert into notifications (gym_id, user_id, type, title, body, link)
    select x.gym_id, x.user_id, 'system',
           'Je onbetaalde boeking is verlopen',
           'De plek is weer vrijgegeven omdat de betaling niet binnen 35 minuten binnenkwam. Boek gerust opnieuw.',
           '/boeken'
    from x
    returning 1
  )
  select count(*) into n from x;
  return n;
end; $$;
grant execute on function public.expire_unpaid_bookings(uuid) to authenticated, service_role;

create or replace function public.free_expired_slot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'bevestigd' then
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where gym_id = new.gym_id and starts_at = new.starts_at and status = 'bevestigd'
      and paid = false and price_cents > 0
      and payment_source in ('los', 'abo')
      and created_at < now() - interval '35 minutes';
  end if;
  return new;
end; $$;
drop trigger if exists free_expired_slot_before on bookings;
create trigger free_expired_slot_before before insert on bookings
  for each row execute function public.free_expired_slot();
