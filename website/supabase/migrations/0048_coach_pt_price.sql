-- 0048: each coach sets their own personal-training rate (used when a member books that coach).
alter table profiles add column if not exists coach_pt_price_cents int;
