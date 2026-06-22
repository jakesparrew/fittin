-- 0092_coach_billing_details.sql
-- B2B billing details a coach enters in their account so we can issue a correct Belgian invoice for
-- their session-credit purchases (factuur "aan": bedrijfsnaam + btw-nummer + adres). Written via
-- service role after the requireCoach/requireStaff identity check (coach_*/bill_* zijn protected).
alter table public.profiles
  add column if not exists bill_company text,
  add column if not exists bill_vat text,
  add column if not exists bill_address text;
