-- 0158 — Maaltijdplannen en mijlpalen voor de AI-coach (golf 3 en 4 van het plan).
--
-- Zelfde ritme als de trainingsweek: één menu per week, op zondag geleverd in dezelfde mail, met
-- twee extra vragen in de check-in ("kon je het volgen?", "honger?") die de week erna sturen.
--
-- WAAROM een eigen tabel en niet een kolom op coaching_weeks: een lid kan Meal plan aanzetten
-- zonder Workouts, en omgekeerd. Hangt het menu aan de trainingsweek, dan bestaat het niet voor wie
-- alleen voeding wil — en dat is precies de helft van wie hierom vraagt.
--
-- GEZONDHEIDSGEGEVENS: een menu rekent met gewicht, lengte en leeftijd. Dat is art. 9 AVG en dus
-- enkel mogelijk met `profiles.coaching_toestemming_at`. Zonder toestemming wordt er geen menu
-- gemaakt — niet een algemener menu, maar géén. Een voedingsadvies zonder die cijfers is raden, en
-- raden hoort niet in iets waar mensen hun gezondheid aan ophangen.

-- ---------- 1. Het weekmenu ----------
create table if not exists public.coaching_mealweeks (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  member_id    uuid not null references public.profiles(id) on delete cascade,
  -- Los van het trainingsplan: Meal plan kan aan staan zonder Workouts.
  plan_id      uuid references public.coaching_plans(id) on delete set null,
  weeknummer   smallint not null check (weeknummer between 1 and 52),
  -- Het menu zelf. jsonb omdat de vorm (7 dagen × 4 momenten) een boom is en geen tabel, en omdat
  -- er nooit op gezocht of gefilterd wordt — het wordt in zijn geheel getoond of niet.
  menu         jsonb not null,
  boodschappen jsonb,
  -- Wat het model uitrekende. Bewaard zodat de volgende week kan bijstellen zonder opnieuw te rekenen.
  kcal_richtlijn int check (kcal_richtlijn is null or (kcal_richtlijn between 1200 and 6000)),
  toelichting  text,
  -- Snapshot van de toestemming op het moment van maken: zo blijft achteraf aantoonbaar dat er
  -- toestemming was toen dit menu gemaakt werd, ook als het lid ze later intrekt.
  toestemming_at timestamptz not null,
  created_at   timestamptz not null default now()
);
create unique index if not exists coaching_mealweeks_lid_week on public.coaching_mealweeks (member_id, weeknummer);
create index if not exists coaching_mealweeks_gym_idx on public.coaching_mealweeks (gym_id, created_at);

alter table public.coaching_mealweeks enable row level security;
drop policy if exists coaching_mealweeks_eigen on public.coaching_mealweeks;
create policy coaching_mealweeks_eigen on public.coaching_mealweeks for select
  using (member_id = auth.uid());
drop policy if exists coaching_mealweeks_beheer on public.coaching_mealweeks;
create policy coaching_mealweeks_beheer on public.coaching_mealweeks for select
  using (gym_id = current_gym_id() and is_beheerder());
-- Bewust GEEN coachbeleid: een menu is voeding, en dat is gevoeliger dan een trainingsschema. Wie
-- wil dat zijn coach meekijkt, stuurt het zelf door.
revoke all on public.coaching_mealweeks from public, anon, authenticated;
grant select on public.coaching_mealweeks to authenticated;
grant select, insert, update, delete on public.coaching_mealweeks to service_role;

-- ---------- 2. Voedingsvoorkeuren op het profiel ----------
alter table public.profiles add column if not exists coaching_voeding text[] not null default '{}';
alter table public.profiles add column if not exists coaching_voeding_vrij text;
-- Zie 0157: een nieuwe kolom erft hier geen rechten.
grant select (coaching_voeding, coaching_voeding_vrij) on public.profiles to authenticated, service_role;
grant update (coaching_voeding, coaching_voeding_vrij) on public.profiles to service_role;

-- ---------- 3. De twee extra check-invragen ----------
alter table public.coaching_checkins add column if not exists menu_gevolgd text
  check (menu_gevolgd is null or menu_gevolgd in ('vlot', 'deels', 'niet'));
alter table public.coaching_checkins add column if not exists honger text
  check (honger is null or honger in ('nee', 'soms', 'vaak'));
grant select (menu_gevolgd, honger) on public.coaching_checkins to authenticated, service_role;
grant update (menu_gevolgd, honger) on public.coaching_checkins to service_role;

-- ---------- 4. Mijlpalen ----------
-- Eén rij per bereikte mijlpaal, zodat er nooit twee keer over hetzelfde bericht vertrekt. Dat is
-- de hele reden dat dit een tabel is en geen berekening: "eerste week af" mag één keer gevierd
-- worden, en een cron die elke zondag draait zou dat anders elke week opnieuw doen.
create table if not exists public.coaching_mijlpalen (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  member_id  uuid not null references public.profiles(id) on delete cascade,
  soort      text not null,
  detail     text,
  gemeld_at  timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists coaching_mijlpalen_uniek on public.coaching_mijlpalen (member_id, soort);

alter table public.coaching_mijlpalen enable row level security;
drop policy if exists coaching_mijlpalen_eigen on public.coaching_mijlpalen;
create policy coaching_mijlpalen_eigen on public.coaching_mijlpalen for select
  using (member_id = auth.uid());
drop policy if exists coaching_mijlpalen_beheer on public.coaching_mijlpalen;
create policy coaching_mijlpalen_beheer on public.coaching_mijlpalen for select
  using (gym_id = current_gym_id() and is_beheerder());
revoke all on public.coaching_mijlpalen from public, anon, authenticated;
grant select on public.coaching_mijlpalen to authenticated;
grant select, insert, update on public.coaching_mijlpalen to service_role;

-- ---------- 5. Doorverwijzing naar een echte coach ----------
-- Wanneer de coach doorverwijst (pijn, drie weken te zwaar), moet dat één keer gebeuren en niet
-- elke zondag opnieuw. En de beheerder moet kunnen zien dat er een lead ligt.
alter table public.coaching_plans add column if not exists doorverwezen_at timestamptz;
alter table public.coaching_plans add column if not exists doorverwijs_reden text;
grant select (doorverwezen_at, doorverwijs_reden) on public.coaching_plans to authenticated, service_role;
grant update (doorverwezen_at, doorverwijs_reden) on public.coaching_plans to service_role;
