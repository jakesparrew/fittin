-- 0033: a session is € 15 and 60 minutes (was € 11 / 75 min). Update live data + defaults.
update gyms set slot_minutes = 60 where slot_minutes = 75;
update services set duration_min = 60 where duration_min = 75;
update services set price_cents = 1500 where key = 'fit60' and price_cents = 1100;

alter table gyms alter column slot_minutes set default 60;
alter table services alter column duration_min set default 60;
