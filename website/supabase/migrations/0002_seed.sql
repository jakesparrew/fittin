-- Seed: Fittin' (gym #1) + its services. Idempotent on slug/key.

insert into gyms (slug, name, address, open_hour, close_hour, slot_minutes, daluur_until_hour)
values ('fittin', 'Fittin''', 'Aannemersstraat 186, 9040 Gent', 7, 21, 75, 16)
on conflict (slug) do update set
  name = excluded.name,
  address = excluded.address;

-- Services for Fittin'. Prices in cents. fit60 = reserve the whole gym (1-4 personen, €11 flat).
with g as (select id from gyms where slug = 'fittin')
insert into services (gym_id, type, key, name, duration_min, price_cents, capacity)
select g.id, v.type::service_type, v.key, v.name, v.duration_min, v.price_cents, v.capacity
from g, (values
  ('fit60'::text, 'fit60'::text, 'Fit60 — privé gym',   75,  1100, 4),
  ('pt',          'pt',          'Personal training',   60,  6000, 3),
  ('event',       'event',       'Event / groepsles',   75,  1500, 12)
) as v(type, key, name, duration_min, price_cents, capacity)
on conflict (gym_id, key) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  capacity = excluded.capacity,
  duration_min = excluded.duration_min;
