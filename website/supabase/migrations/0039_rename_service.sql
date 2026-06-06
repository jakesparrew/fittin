-- 0039: a Fit60 booking is just "a session" — rename the public-facing service name.
update services set name = 'Privé sessie' where key = 'fit60' and name = 'Fit60 — privé gym';
