-- 0162 — Een mijlpaal hoort bij een PLAN, niet bij een leven.
--
-- WAT ER MIS WAS. 0158 zette de sleutel op (member_id, soort): één "eerste sessie" per lid, ooit.
-- Dat leest als een leuke eigenschap ("je eerste sessie is maar één keer je eerste") en is in de
-- praktijk een doodlopende module. Wie zijn plan van acht weken uitdoet en aan een tweede begint,
-- heeft "eerste_sessie", "eerste_week", "tien_sessies" en "halfweg" al op zijn naam staan — en
-- krijgt daar dus nooit meer iets over te horen. De motivatiemodule is stil vanaf plan twee.
--
-- Dat is precies omgekeerd aan waar mijlpalen voor zijn. De tweede keer beginnen is moeilijker dan
-- de eerste: de nieuwigheid is weg en het lid weet nu hoeveel weken er nog komen.
--
-- WAAROM plan_id NULLABLE BLIJFT. De rijen die er vandaag staan horen bij het plan dat toen liep,
-- maar welk plan dat was, valt alleen uit de tijdstempels af te leiden — en dat is precies het soort
-- gok waar 0161 een eind aan maakte. Ze houden `plan_id is null` en betekenen "van vóór deze
-- migratie". `nulls not distinct` zorgt dat ze elkaar nog steeds ontdubbelen (Postgres 17).
--
-- Concreet gevolg voor het account van de eigenaar: zijn "eerste_sessie" van plan 1 blijft staan,
-- en het plan dat nu loopt kan hem opnieuw halen. Dat is de bedoeling.

alter table public.coaching_mijlpalen
  add column if not exists plan_id uuid references public.coaching_plans(id) on delete cascade;

drop index if exists public.coaching_mijlpalen_uniek;
create unique index if not exists coaching_mijlpalen_uniek
  on public.coaching_mijlpalen (member_id, plan_id, soort) nulls not distinct;

-- Een nieuwe kolom erft geen kolomrechten (les van 0152, 0157, 0158 en 0161). Zonder deze grant
-- schrijft de cron de kolom stil weg als null en staat elke mijlpaal weer in de oude emmer.
grant select (plan_id), insert (plan_id), update (plan_id) on public.coaching_mijlpalen to service_role;
grant select (plan_id) on public.coaching_mijlpalen to authenticated;
