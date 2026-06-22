-- 0088_admin_reschedule_booking.sql
-- Let a BEHEERDER move any booking in their gym to a new day/hour (drag-and-drop in the planner).
-- Unlike the member/coach reschedule (0086) there is NO 6h-before rule — an admin may move a session
-- at any time — but the target slot may not be in the past. Opening-hours, overlap and slot-block
-- checks all run server-side and atomically (exclusion constraint). The exact session duration is
-- preserved. The old keypad code + access/reminder flags are cleared so a fresh PIN is minted for the
-- new time (next code creation revokes the old auth by its deterministic name; see 0079).
create or replace function public.admin_reschedule_booking(p_booking uuid, p_date date, p_hour numeric)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role user_role; v_admin_gym uuid;
  v_b bookings%rowtype;
  v_open int; v_close int;
  v_dur interval; v_dur_h numeric;
  v_start timestamptz; v_end timestamptz;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn.' using errcode='P0001'; end if;
  select role, gym_id into v_role, v_admin_gym from profiles where id = v_uid;
  if v_role <> 'beheerder' then raise exception 'Alleen de beheerder kan dit.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;

  -- Beheerder may only touch bookings in their own gym.
  select * into v_b from bookings where id = p_booking and gym_id = v_admin_gym and status = 'bevestigd';
  if v_b.id is null then raise exception 'Boeking niet gevonden.' using errcode='P0001'; end if;

  v_dur := v_b.ends_at - v_b.starts_at;
  v_dur_h := extract(epoch from v_dur) / 3600.0;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_b.gym_id;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_dur_h > v_close then raise exception 'De duur valt buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + v_dur;
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

  if exists (select 1 from bookings b where b.gym_id = v_b.gym_id and b.status = 'bevestigd' and b.id <> p_booking
              and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is al geboekt. Kies een ander moment.' using errcode='P0001';
  end if;
  if exists (select 1 from slot_blocks sb where sb.gym_id = v_b.gym_id
              and tstzrange(sb.starts_at, sb.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is geblokkeerd.' using errcode='P0001';
  end if;

  begin
    update bookings set starts_at = v_start, ends_at = v_end,
        reminder_sent = false, access_sent = false, nuki_code = null
      where id = p_booking;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is net geboekt. Kies een ander uur.' using errcode='P0001';
  end;
  return v_start;
end; $$;
grant execute on function public.admin_reschedule_booking(uuid, date, numeric) to authenticated;
