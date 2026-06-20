-- 0077_taken_slots_robust.sql
-- Make gym_taken_slots robust for bookings/blocks whose duration is NOT a multiple of 30 min
-- (e.g. an admin-set service duration of 45 or 90). Anchor the 30-min series on the absolute
-- half-hour grid (epoch floor) and run until the real end, so EVERY half-hour cell that a booking
-- overlaps is greyed out — not just the ones aligned to its own start. Grid instants land on UTC
-- :00/:30 (Brussels offset is whole hours), matching the client's slotInstant() grid exactly.
create or replace function public.gym_taken_slots(p_gym uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select gs as starts_at
  from bookings b
  cross join lateral generate_series(
    to_timestamp(floor(extract(epoch from b.starts_at) / 1800) * 1800),
    b.ends_at - interval '1 second',
    interval '30 minutes') gs
  where b.gym_id = p_gym and b.status = 'bevestigd' and gs >= p_from and gs < p_to
  union
  select gs as starts_at
  from slot_blocks sb
  cross join lateral generate_series(
    to_timestamp(floor(extract(epoch from sb.starts_at) / 1800) * 1800),
    sb.ends_at - interval '1 second',
    interval '30 minutes') gs
  where sb.gym_id = p_gym and gs >= p_from and gs < p_to;
$$;
grant execute on function public.gym_taken_slots(uuid, timestamptz, timestamptz) to anon, authenticated;
