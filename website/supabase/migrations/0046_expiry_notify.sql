-- 0046: when an unpaid booking auto-expires, notify the member (so they know their slot was freed).
create or replace function public.expire_unpaid_bookings(p_gym uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with x as (
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where status = 'bevestigd' and paid = false and price_cents > 0 and payment_source = 'los'
      and created_at < now() - interval '20 minutes'
      and (p_gym is null or gym_id = p_gym)
    returning id, gym_id, user_id
  ),
  ins as (
    insert into notifications (gym_id, user_id, type, title, body, link)
    select x.gym_id, x.user_id, 'system',
           'Je onbetaalde boeking is verlopen',
           'De plek is weer vrijgegeven omdat de betaling niet binnen 20 minuten binnenkwam. Boek gerust opnieuw.',
           '/boeken'
    from x
    returning 1
  )
  select count(*) into n from x;
  return n;
end; $$;
grant execute on function public.expire_unpaid_bookings(uuid) to authenticated, service_role;
