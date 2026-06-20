-- 0073: per-formule personal-training tariffs.
-- coach_pt_price_cents (bestaat al) = 1-op-1 totaalprijs.
-- coach_pt2/pt3 = prijs PER PERSOON voor 1-op-2 / 1-op-3 (de boeking rekent tarief × personen).
-- NB: coach_* kolommen worden geschreven via de service-role admin client in de server actions
-- (na identiteitscheck) — de column-grants uit 0015 staan geen coach_* writes toe voor 'authenticated'.
alter table profiles add column if not exists coach_pt2_price_cents int;
alter table profiles add column if not exists coach_pt3_price_cents int;
