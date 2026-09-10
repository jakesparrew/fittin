-- 0159 — Een weekmenu hoort bij één plan, niet bij één weeknummer.
--
-- Wat er mis was. 0158 zette de sleutel op (member_id, weeknummer). Dat leest alsof het klopt, maar
-- `weeknummer` telt binnen een PLAN en begint bij elk nieuw plan opnieuw bij 1. Een lid dat zijn
-- acht weken uitdeed en aan een tweede reeks begon, overschreef daarmee week voor week de menu's
-- van zijn eerste plan — de upsert vond de oude rij en schreef eroverheen. Niemand zou dat gemerkt
-- hebben behalve wie terugbladert.
--
-- Waarom `nulls not distinct`. `plan_id` mag null zijn: Meal plan kan aanstaan zonder Workouts, en
-- dan is er geen trainingsplan om aan te hangen. Standaard beschouwt Postgres twee NULL's als
-- verschillend, waardoor precies die groep leden — de groep zonder plan — elke week een tweede rij
-- zou krijgen in plaats van een bijgewerkte. `nulls not distinct` (Postgres 15+, hier draait 17)
-- houdt de ontdubbeling voor hen intact.
--
-- Er staan vandaag nul rijen in deze tabel, dus er valt niets te migreren. Deze migratie is
-- preventief: ze kost nu niets en na het eerste tweede plan is ze niet meer zonder verlies te doen.
--
-- LET OP: de leeskant moest mee. `menuVoorWeek()` en `dossierVoor()` deden `maybeSingle()` op
-- (member_id, weeknummer). Zodra twee plannen een week 3 mogen hebben, geeft dat een fout in plaats
-- van een menu. Beide zijn nu op plan_id begrensd én op limit(1) gezet.

drop index if exists public.coaching_mealweeks_lid_week;

create unique index if not exists coaching_mealweeks_lid_plan_week
  on public.coaching_mealweeks (member_id, plan_id, weeknummer) nulls not distinct;
