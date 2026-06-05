-- 0028: legal/billing details for the non-profit, used on generated invoices (BE 6% VAT).
alter table gyms add column if not exists legal_name     text;   -- vzw legal name
alter table gyms add column if not exists vat_number     text;   -- ondernemings-/btw-nummer (BE0xxx...)
alter table gyms add column if not exists iban           text;
alter table gyms add column if not exists invoice_email  text;
alter table gyms add column if not exists invoice_footer text;   -- free note (e.g. "Sport-vzw, 6% btw")
alter table gyms add column if not exists invoice_seq    int not null default 0; -- running invoice counter
