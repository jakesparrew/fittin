-- 0059: perf — the beheer "leden" page aggregates the whole credits_ledger per gym, but 0054's
-- perf indexes didn't cover credits_ledger.gym_id (only credits_user_idx existed). Add it to
-- keep the gym-scoped balance rollups index-backed as the ledger grows.
create index if not exists credits_ledger_gym_idx on credits_ledger(gym_id);
