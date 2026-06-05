-- 0023: invite any gym member to a booking (not just pre-accepted buddies), capped at the booking's
-- person count. Their attendance counts as a visit for them (via member_engagement).
create or replace function public.add_booking_participants(p_booking uuid, p_users uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_gym uuid; v_owner uuid; v_persons int; v_cap int; v_have int;
  u uuid; n int := 0;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id, user_id, persons into v_gym, v_owner, v_persons from bookings where id = p_booking;
  if v_owner is null or v_owner <> v_uid then raise exception 'Geen eigen boeking.' using errcode='P0001'; end if;
  v_cap := greatest(0, coalesce(v_persons, 1) - 1);
  select count(*) into v_have from booking_participants where booking_id = p_booking;
  foreach u in array coalesce(p_users, '{}') loop
    exit when (v_have + n) >= v_cap;
    if u <> v_uid and exists (select 1 from profiles where id = u and gym_id = v_gym) then
      insert into booking_participants (gym_id, booking_id, user_id) values (v_gym, p_booking, u)
      on conflict (booking_id, user_id) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end; $$;
grant execute on function public.add_booking_participants(uuid, uuid[]) to authenticated;
