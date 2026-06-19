-- 0067: members can opt out of the leaderboard from their profile. Coaches/beheerders are never
-- shown on the leaderboard (filtered in the queries). PT sessions already count because the
-- booking's user_id is the member (client), even when the coach books it.
alter table profiles add column if not exists leaderboard_opt_in boolean not null default true;
-- Members may toggle their own opt-in (profiles updates are column-locked since 0015).
grant update (leaderboard_opt_in) on profiles to authenticated;
