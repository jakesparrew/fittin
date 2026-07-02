-- 0099_door_log_index.sql
-- The admin Leden page derives "laatste bezoek" from door_log with an ORDER BY opened_at DESC
-- LIMIT 5000 scan of a forever-growing table that had NO index. Add a partial index matching the
-- exact query shape (gym + successful opens, newest first).
create index if not exists door_log_gym_ok_opened_idx
  on door_log (gym_id, opened_at desc)
  where result = 'ok';
