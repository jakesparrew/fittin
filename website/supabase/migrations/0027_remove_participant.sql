-- 0027: let the booking owner remove someone they invited (manage who's coming along).
create or replace function public.remove_booking_participant(p_booking uuid, p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_owner uuid; n int;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select user_id into v_owner from bookings where id = p_booking;
  if v_owner is null or v_owner <> v_uid then raise exception 'Geen eigen boeking.' using errcode='P0001'; end if;
  delete from booking_participants where booking_id = p_booking and user_id = p_user;
  get diagnostics n = row_count;
  return n;
end; $$;
grant execute on function public.remove_booking_participant(uuid, uuid) to authenticated;
