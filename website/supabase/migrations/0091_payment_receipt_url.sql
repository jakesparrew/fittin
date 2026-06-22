-- 0091_payment_receipt_url.sql
-- Store the Stripe hosted receipt URL (one-time payments) / hosted invoice URL (subscription invoices)
-- on each payment, so members & coaches can download their betaalbewijs straight from their dashboard.
alter table public.payments add column if not exists receipt_url text;
