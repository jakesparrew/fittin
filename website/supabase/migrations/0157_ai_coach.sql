-- 0157 — De AI-coach: intakegegevens op het profiel, en het dossier waarop de coach verder bouwt.
--
-- Wat dit mogelijk maakt: een lid doorloopt één keer een intake op /coaching, krijgt een plan van
-- 6 tot 12 weken, en vinkt per sessie af. Elke zondag komt er een check-in en gaat de volgende week
-- open. Het model maakt het plan (één keer) en schrijft de weekzin; de progressie zelf gebeurt in
-- code (lib/coaching/progressie.js) — dat is geen intelligentie maar een tabel, en het scheelt
-- tokens én onvoorspelbaarheid.
--
-- WAAROM een week een `programs`-rij is en geen nieuwe structuur: programs → program_days →
-- program_exercises bestaat al, met alles wat een voorschrift nodig heeft (sets, reps, rest_sec,
-- rep_text, tempo, notes, target_weight_kg, rpe, superset). Het sessiescherm, de speler en de
-- oefeningpagina's lezen daar al uit. Een tweede trainingsstructuur ernaast zou betekenen dat elk
-- bestaand scherm twee vormen moet kennen. Dus: één week = één `programs`-rij (member_id = het lid),
-- elke sessie in die week = één `program_days`-rij. Wat hieronder bijkomt is uitsluitend het
-- DOSSIER eromheen — het verhaal dat een gewone programmarij niet kan dragen.
--
-- WAAROM het dossier in gewone taal staat en niet in codes: het lid leest het terug op /coaching, en
-- bij een doorverwijzing naar een menselijke coach gaat het mee. Een coach die "besluit=inkorten"
-- leest heeft niets; een coach die leest "week 3 half afgewerkt na een drukke week, squat te zwaar,
-- daarom volume terug" begint niet van nul. Dat is het hele punt van A5-2 in het plan.
--
-- GEZONDHEIDSGEGEVENS: gewicht, geboortedatum en beperkingen zijn bijzondere categorieën zodra ze
-- naar een extern model gaan (art. 9 AVG). `coaching_toestemming_at` is de enige sleutel die dat
-- opent: is die null, dan gaan die velden niet mee in de prompt en blijft Meal plan uit. Intrekken
-- zet de kolom terug op null; het dossier zelf blijft van het lid.

-- ---------- 1. Persoonsgegevens op het profiel ----------
-- De eigenaar vroeg expliciet om de intakegegevens in het profiel te verrijken, niet alleen in het
-- dossier. Deze drie zijn algemene persoonsgegevens (ook zonder coaching zinvol: geboortedatum
-- stond al in de aanmeldformulieren, geslacht ook). De coaching_*-velden eronder horen alleen bij
-- de AI-coach. Bewust GEEN `coach_`-prefix: die ruimte is van de menselijke coaches (coach_bio,
-- coach_specialty, coach_accepting_clients) en dat door elkaar halen leest verkeerd in elke query.
alter table public.profiles add column if not exists geboortedatum date;
alter table public.profiles add column if not exists geslacht text check (geslacht is null or geslacht in ('Vrouw', 'Man', 'X'));
alter table public.profiles add column if not exists gewicht_kg numeric(5,1) check (gewicht_kg is null or (gewicht_kg > 25 and gewicht_kg < 400));

alter table public.profiles add column if not exists coaching_doel text check (coaching_doel is null or coaching_doel in ('sterker', 'conditie', 'afvallen', 'spiermassa', 'bewegen'));
alter table public.profiles add column if not exists coaching_ervaring text check (coaching_ervaring is null or coaching_ervaring in ('nooit', 'soms', 'vaak'));
alter table public.profiles add column if not exists coaching_dagen smallint check (coaching_dagen is null or (coaching_dagen between 1 and 7));
alter table public.profiles add column if not exists coaching_beperkingen text;
alter table public.profiles add column if not exists coaching_toon text check (coaching_toon is null or coaching_toon in ('scherp', 'rustig'));
alter table public.profiles add column if not exists coaching_modules text[] not null default '{}';
-- De enige sleutel voor art. 9. Null = geen toestemming = gewicht/geboortedatum/beperkingen gaan
-- niet naar het model. Een timestamp en geen boolean, want bij een toestemming hoort te staan
-- wannéér ze gegeven is.
alter table public.profiles add column if not exists coaching_toestemming_at timestamptz;

-- 0015 sloot UPDATE op profiles af en gaf het per kolom terug; 0132 deed hetzelfde voor SELECT.
-- Een NIEUWE kolom erft dus niets. Zonder deze twee regels kan de intake niets wegschrijven en
-- leest de app overal null — precies de fout die 0139 moest repareren voor
-- training_visible_to_buddies (gebouwd, maar deed stil niets).
grant select (geboortedatum, geslacht, gewicht_kg, coaching_doel, coaching_ervaring, coaching_dagen,
              coaching_beperkingen, coaching_toon, coaching_modules, coaching_toestemming_at)
  on public.profiles to authenticated, service_role;
grant update (geboortedatum, geslacht, gewicht_kg, coaching_doel, coaching_ervaring, coaching_dagen,
              coaching_beperkingen, coaching_toon, coaching_modules, coaching_toestemming_at)
  on public.profiles to service_role;

-- ---------- 2. Het plan ----------
create table if not exists public.coaching_plans (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  member_id      uuid not null references public.profiles(id) on delete cascade,
  doel           text not null,
  weken          smallint not null check (weken between 4 and 16),
  sessies_per_week smallint not null check (sessies_per_week between 1 and 7),
  -- Wat het model bij aanmaak schreef, in gewone taal. Dit is wat het lid als eerste leest.
  samenvatting   text,
  status         text not null default 'lopend' check (status in ('lopend', 'gepauzeerd', 'afgerond', 'gestopt')),
  gestart_op     date not null default (now() at time zone 'Europe/Brussels')::date,
  afgerond_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Eén lopend plan per lid. Twee plannen tegelijk betekent twee weken die tegelijk opengaan en twee
-- zondagmails — dat is geen coach meer maar ruis. Een nieuw plan starten sluit het vorige af.
create unique index if not exists coaching_plans_een_lopend
  on public.coaching_plans (member_id) where status = 'lopend';
create index if not exists coaching_plans_gym_idx on public.coaching_plans (gym_id, status);

alter table public.coaching_plans enable row level security;
drop policy if exists coaching_plans_eigen on public.coaching_plans;
create policy coaching_plans_eigen on public.coaching_plans for select
  using (member_id = auth.uid());
drop policy if exists coaching_plans_beheer on public.coaching_plans;
create policy coaching_plans_beheer on public.coaching_plans for select
  using (gym_id = current_gym_id() and is_beheerder());
-- Een coach ziet het dossier van zijn eigen, aanvaarde clienten — dat is de brug uit A5-2. Bewust
-- is_beheerder() hierboven en een expliciete koppelcontrole hier: is_staff() zou elk dossier aan
-- alle acht coaches geven, en dat is exact de fout die 0156 moest rechtzetten.
drop policy if exists coaching_plans_coach on public.coaching_plans;
create policy coaching_plans_coach on public.coaching_plans for select
  using (exists (select 1 from public.coach_clients cc
                 where cc.client_id = coaching_plans.member_id
                   and cc.coach_id = auth.uid() and cc.status = 'accepted'));
revoke all on public.coaching_plans from public, anon, authenticated;
grant select on public.coaching_plans to authenticated;
grant select, insert, update, delete on public.coaching_plans to service_role;

-- ---------- 3. De weken ----------
create table if not exists public.coaching_weeks (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  plan_id      uuid not null references public.coaching_plans(id) on delete cascade,
  weeknummer   smallint not null check (weeknummer between 1 and 16),
  -- De week is een gewone programmarij; hier staat alleen welke. Null zolang de week nog een
  -- schets is: het plan toont alle weken vooraf, maar alleen een geopende week heeft oefeningen.
  program_id   uuid references public.programs(id) on delete set null,
  -- Wat de coach vóór deze week schreef, in gewone taal: wat vooruitging, wat er daarom verandert.
  -- `analyse` alleen is een GERESERVEERD woord in PostgreSQL (Britse schrijfwijze van ANALYZE);
  -- de rollback-test op productie ving dat. Vandaar weekanalyse.
  weekanalyse  text,
  -- Het besluit uit lib/coaching/progressie.js dat tot deze week leidde.
  besluit      text check (besluit is null or besluit in ('door', 'inkorten', 'herhaal', 'pauze_vragen', 'aanpassen', 'doorverwijzen')),
  is_rustweek  boolean not null default false,
  unlocked_at  timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists coaching_weeks_plan_nr on public.coaching_weeks (plan_id, weeknummer);
create index if not exists coaching_weeks_open_idx on public.coaching_weeks (plan_id) where completed_at is null;

alter table public.coaching_weeks enable row level security;
drop policy if exists coaching_weeks_eigen on public.coaching_weeks;
create policy coaching_weeks_eigen on public.coaching_weeks for select
  using (exists (select 1 from public.coaching_plans p where p.id = plan_id and p.member_id = auth.uid()));
drop policy if exists coaching_weeks_beheer on public.coaching_weeks;
create policy coaching_weeks_beheer on public.coaching_weeks for select
  using (gym_id = current_gym_id() and is_beheerder());
drop policy if exists coaching_weeks_coach on public.coaching_weeks;
create policy coaching_weeks_coach on public.coaching_weeks for select
  using (exists (select 1 from public.coaching_plans p
                 join public.coach_clients cc on cc.client_id = p.member_id
                 where p.id = plan_id and cc.coach_id = auth.uid() and cc.status = 'accepted'));
revoke all on public.coaching_weeks from public, anon, authenticated;
grant select on public.coaching_weeks to authenticated;
grant select, insert, update, delete on public.coaching_weeks to service_role;

-- ---------- 4. De sessies: wat het lid afvinkt ----------
-- Bewust een eigen tabel en geen kolom op program_days: die tabel is gedeeld met de programma's van
-- de menselijke coaches en met de publieke workouts. Een "gedaan"-vlag daarop zou betekenen dat één
-- sjabloon voor iedereen tegelijk afgevinkt raakt.
create table if not exists public.coaching_sessions (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  week_id        uuid not null references public.coaching_weeks(id) on delete cascade,
  program_day_id uuid not null references public.program_days(id) on delete cascade,
  volgnummer     smallint not null,
  -- Gekoppeld aan een echte boeking zodra het lid er een heeft; dan weet de deurcodemail welke
  -- sessie vandaag aan de beurt is. Null = de sessie staat klaar maar er is nog geen moment voor.
  booking_id     uuid references public.bookings(id) on delete set null,
  gedaan_at      timestamptz,
  oordeel        text check (oordeel is null or oordeel in ('te_licht', 'goed', 'te_zwaar')),
  created_at     timestamptz not null default now()
);
create unique index if not exists coaching_sessions_week_nr on public.coaching_sessions (week_id, volgnummer);
create index if not exists coaching_sessions_boeking_idx on public.coaching_sessions (booking_id) where booking_id is not null;

alter table public.coaching_sessions enable row level security;
drop policy if exists coaching_sessions_eigen on public.coaching_sessions;
create policy coaching_sessions_eigen on public.coaching_sessions for select
  using (exists (select 1 from public.coaching_weeks w join public.coaching_plans p on p.id = w.plan_id
                 where w.id = week_id and p.member_id = auth.uid()));
drop policy if exists coaching_sessions_beheer on public.coaching_sessions;
create policy coaching_sessions_beheer on public.coaching_sessions for select
  using (gym_id = current_gym_id() and is_beheerder());
drop policy if exists coaching_sessions_coach on public.coaching_sessions;
create policy coaching_sessions_coach on public.coaching_sessions for select
  using (exists (select 1 from public.coaching_weeks w
                 join public.coaching_plans p on p.id = w.plan_id
                 join public.coach_clients cc on cc.client_id = p.member_id
                 where w.id = week_id and cc.coach_id = auth.uid() and cc.status = 'accepted'));
revoke all on public.coaching_sessions from public, anon, authenticated;
grant select on public.coaching_sessions to authenticated;
grant select, insert, update, delete on public.coaching_sessions to service_role;

-- ---------- 5. De check-in ----------
create table if not exists public.coaching_checkins (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references public.gyms(id) on delete cascade,
  week_id        uuid not null references public.coaching_weeks(id) on delete cascade,
  zwaarte        text check (zwaarte is null or zwaarte in ('te_licht', 'goed', 'te_zwaar')),
  verloop        text check (verloop is null or verloop in ('vlot', 'wisselend', 'moeilijk')),
  pijn           boolean not null default false,
  pijn_waar      text,
  energie        text check (energie is null or energie in ('goed', 'ok', 'laag')),
  vrij           text,
  -- Wat de coach eruit las, en welke aanpassing eruit volgde. Samen met coaching_weeks.weekanalyse is
  -- dit het geheugen: elke volgende week krijgt deze regels als invoer.
  interpretatie  text,
  created_at     timestamptz not null default now()
);
create unique index if not exists coaching_checkins_week on public.coaching_checkins (week_id);

alter table public.coaching_checkins enable row level security;
drop policy if exists coaching_checkins_eigen on public.coaching_checkins;
create policy coaching_checkins_eigen on public.coaching_checkins for select
  using (exists (select 1 from public.coaching_weeks w join public.coaching_plans p on p.id = w.plan_id
                 where w.id = week_id and p.member_id = auth.uid()));
drop policy if exists coaching_checkins_beheer on public.coaching_checkins;
create policy coaching_checkins_beheer on public.coaching_checkins for select
  using (gym_id = current_gym_id() and is_beheerder());
drop policy if exists coaching_checkins_coach on public.coaching_checkins;
create policy coaching_checkins_coach on public.coaching_checkins for select
  using (exists (select 1 from public.coaching_weeks w
                 join public.coaching_plans p on p.id = w.plan_id
                 join public.coach_clients cc on cc.client_id = p.member_id
                 where w.id = week_id and cc.coach_id = auth.uid() and cc.status = 'accepted'));
revoke all on public.coaching_checkins from public, anon, authenticated;
grant select on public.coaching_checkins to authenticated;
grant select, insert, update, delete on public.coaching_checkins to service_role;

-- ---------- 6. Wat het model kost ----------
-- Eén rij per aanroep. Niet om mooi te doen, maar omdat de vorige AI-poging in dit huis het budget
-- opbrandde zonder dat iemand het zag: een redeneermodel rekende zijn verborgen redenering als
-- uitvoer af, 5.000 tokens per beurt, nul zichtbare tekst. Zonder deze tabel is dat pas op de
-- factuur zichtbaar. De dagrem in lib/coaching/budget.js telt hierop.
create table if not exists public.coaching_verbruik (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid references public.profiles(id) on delete set null,
  soort       text not null,
  model       text not null,
  in_tokens   int not null default 0,
  uit_tokens  int not null default 0,
  -- Micro-USD als heel getal: centen zijn te grof voor een aanroep van $0,003, en een float telt
  -- na duizend rijen niet meer op tot wat je verwacht.
  kost_micro  int not null default 0,
  ok          boolean not null default true,
  fout        text,
  created_at  timestamptz not null default now()
);
create index if not exists coaching_verbruik_dag_idx on public.coaching_verbruik (gym_id, created_at);

alter table public.coaching_verbruik enable row level security;
drop policy if exists coaching_verbruik_beheer on public.coaching_verbruik;
create policy coaching_verbruik_beheer on public.coaching_verbruik for select
  using (gym_id = current_gym_id() and is_beheerder());
-- Geen enkel lid hoeft te weten wat zijn coach kost; dit is een boekhoudtabel.
revoke all on public.coaching_verbruik from public, anon, authenticated;
grant select, insert on public.coaching_verbruik to service_role;

-- ---------- 7. updated_at bijhouden op het plan ----------
-- 0138 zette dezelfde trigger op de inhoudstabellen; hergebruik die functie in plaats van een tweede.
drop trigger if exists coaching_plans_touch_updated_at on public.coaching_plans;
create trigger coaching_plans_touch_updated_at
  before update on public.coaching_plans
  for each row execute function public.touch_updated_at();
