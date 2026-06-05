-- 0005: door access — "de gym opent zichzelf".
-- Opens only during the member's active booking window; logs every attempt.
-- The actual Nuki Web API call is made server-side (route handler) after this returns ok.

create or replace function public.open_door()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid;
  v_booking uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = v_uid;

  select id into v_booking from bookings
  where user_id = v_uid and status = 'bevestigd'
    and now() >= starts_at - interval '5 minutes' and now() <= ends_at
  order by starts_at limit 1;

  if v_booking is null then
    insert into door_log (gym_id, user_id, result) values (v_gym, v_uid, 'denied');
    raise exception 'Je hebt nu geen actieve boeking.' using errcode='P0001';
  end if;

  insert into door_log (gym_id, user_id, booking_id, result) values (v_gym, v_uid, v_booking, 'ok');
  return 'open';
end; $$;
grant execute on function public.open_door() to authenticated;
