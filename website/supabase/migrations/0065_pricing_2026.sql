-- 0065: pricing update (juni 2026).
--  • Member/abo tariff €10 → €12 (services.member_price_cents for fit60).
--  • 10-beurtenkaart: €150 voor 11 sessies (10 + 1 gratis) — was €100/10.
--  • Abonnement: €12/maand (1 sessie/maand inbegrepen, daarna alles aan €12) — was €10.
--  • Coaches: ALTIJD €12/sessie via prepaid sessietegoed — geen gratis/maandfactuur, geen
--    abonnementen of beurtenkaarten. Bestaande coaches omgezet + nieuwe defaults.
-- Runs after the historical seeds, so this corrects both the live DB and fresh installs.

update services set member_price_cents = 1200 where key = 'fit60';

update packages set price_cents = 15000, credits = 11, active = true where kind = 'beurtenkaart';
update packages set price_cents = 1200, credits = 1, period = 'maand', active = true where kind = 'abonnement';

update profiles set coach_session_price_cents = 1200, coach_billing_mode = 'credit'
  where role in ('coach', 'beheerder');
alter table profiles alter column coach_session_price_cents set default 1200;
alter table profiles alter column coach_billing_mode set default 'credit';
