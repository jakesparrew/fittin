-- De lus oefeningen → workouts sluiten (plan 2026-08-16).
--
-- Drie toevoegingen, meer is er niet nodig — de rest (programs, program_days, program_exercises,
-- workout_logs, buddies, feed) bestaat al en wordt alleen met elkaar verbonden.

-- 1. FAVORIETEN. Zonder dit is de oefeningenbibliotheek een encyclopedie: je kan er niets
--    bewaren, dus kom je er nooit terug. Favorieten voeden ook de zoekvolgorde in de
--    schema-bouwer en de AI-generator ("bouw rond wat hij al graag doet").
create table if not exists public.exercise_favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.exercise_favorites enable row level security;

-- Een lid beheert enkel zijn eigen favorieten. Bewust drie aparte policies: een enkele
-- "for all" zou ook een insert namens iemand anders toelaten zolang de rij bij het lezen matcht.
drop policy if exists ef_select_own on public.exercise_favorites;
create policy ef_select_own on public.exercise_favorites
  for select using (auth.uid() = user_id);
drop policy if exists ef_insert_own on public.exercise_favorites;
create policy ef_insert_own on public.exercise_favorites
  for insert with check (auth.uid() = user_id);
drop policy if exists ef_delete_own on public.exercise_favorites;
create policy ef_delete_own on public.exercise_favorites
  for delete using (auth.uid() = user_id);

create index if not exists exercise_favorites_user_idx on public.exercise_favorites (user_id);
create index if not exists exercise_favorites_exercise_idx on public.exercise_favorites (exercise_id);

-- 2. DEELBAAR SCHEMA. Een lid dat zijn schema in een WhatsApp-groep zet is het goedkoopste
--    acquisitiekanaal dat bestaat, en wie het wil overnemen heeft meteen een reden om een
--    account te maken. Token i.p.v. het id: intrekbaar (nieuwe token = oude link dood) en
--    niet te raden, zodat een gedeeld schema nooit per ongeluk een hele reeks blootlegt.
alter table public.programs
  add column if not exists share_token text unique;

comment on column public.programs.share_token is
  'Willekeurige sleutel voor de login-vrije deelpagina /w/<token>. NULL = niet gedeeld. Opnieuw genereren trekt de oude link in.';

-- 3. VOORTGANG ZICHTBAAR VOOR BUDDIES. Standaard UIT: dat iemand traint is persoonlijke data,
--    en het duo-zicht in de speler mag nooit een verrassing zijn. Zelfde lijn als
--    leaderboard_opt_in, dat al bestaat.
alter table public.profiles
  add column if not exists training_visible_to_buddies boolean not null default false;

comment on column public.profiles.training_visible_to_buddies is
  'Mogen geaccepteerde buddies zien dat dit lid vandaag dezelfde workout doet (duo-zicht in de speler)? Standaard uit.';
