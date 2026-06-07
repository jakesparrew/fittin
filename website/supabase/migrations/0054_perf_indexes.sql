-- 0054: fill the remaining index gaps on hot query paths (faster page loads).
-- account page: partMap looks up participants by booking_id (IN list).
create index if not exists booking_participants_booking_idx on booking_participants(booking_id);
-- booking page: coach availability is filtered per gym.
create index if not exists coach_availability_gym_idx on coach_availability(gym_id);
-- coach dashboard: bookings filtered by coach.
create index if not exists bookings_coach_idx on bookings(coach_id, starts_at);
-- leaderboard scans bookings by gym + status + month window.
create index if not exists bookings_gym_status_start_idx on bookings(gym_id, status, starts_at);
