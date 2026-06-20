-- 0080_discount_amount.sql
-- Discount codes can now be a fixed euro amount, not just a percentage.
-- When amount_cents is set it wins; otherwise the percent applies.
alter table discount_codes add column if not exists amount_cents int;
alter table discount_codes alter column percent drop not null;
