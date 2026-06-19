-- 0070: clean slate for sessions. Scope: bookings + coach availability + slot blocks.
-- Keeps accounts, members, services, packages, pricing, credits, programs, exercises and
-- community posts. The monthly leaderboard is computed live from bookings, so wiping bookings
-- empties it too. Run once.

-- Booking children with NO-ACTION FKs must be cleared before the bookings themselves.
delete from session_notes;            -- coach session feedback (booking_id is NO ACTION)
delete from door_log;                 -- gym entry log (booking_id is NO ACTION)

-- Cascading children (would auto-clear with the bookings, deleted explicitly for clarity).
delete from booking_join_requests;
delete from booking_participants;
delete from event_registrations;

-- The bookings themselves: clears the live leaderboard + all session history.
delete from bookings;

-- Coach availability + admin slot blocks reset to empty.
delete from coach_availability;
delete from slot_blocks;

-- Free-first-session promo: every member who hasn't used it yet is eligible from now on
-- (so existing accounts like "Ran" can book their free session straight away).
update profiles set welcome_status = 'eligible'
  where role = 'lid' and welcome_code_used = false and welcome_status <> 'used';
