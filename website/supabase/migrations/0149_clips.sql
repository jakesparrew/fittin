-- 0149: een persoonlijke videobibliotheek — bewaarde links uit Instagram, YouTube en TikTok.
--
-- WAAROM: coaches én leden halen hun oefeningen van sociale media. Vandaag is daar geen plek voor:
-- een reel die iemand goed vindt blijft in zijn eigen Instagram-favorieten hangen, waar de app hem
-- nooit ziet en waar hij bij het samenstellen van een schema niets aan heeft. Deze twee tabellen
-- geven elk lid een eigen plank met mappen ("Leg day", "Mobiliteit") en de coach een weg van
-- bewaarde clip naar echte oefening in een programma.
--
-- WAT WE BEWUST NIET BEWAREN: de video zelf, en ook geen thumbnail van het platform. Het materiaal
-- binnenhalen is tegen de voorwaarden van Instagram en TikTok, en hun beeld-URL's zijn ondertekend
-- en verlopen binnen enkele dagen — een gekopieerde thumbnail is dus sowieso een kapot beeld in
-- wording. We bewaren de link en de naam die de gebruiker zelf geeft; het tonen gebeurt in het
-- officiële kader van de bron.
--
-- PRIVÉ TENZIJ ANDERS: een bibliotheek is persoonlijk. De RLS hieronder laat alleen eigen rijen
-- toe — geen gym-brede leesregel zoals bij `exercises`, want dan zou over een maand de plank van
-- 83 leden door elkaar staan. Wil een coach een clip delen, dan maakt hij er expliciet een
-- oefening van (coachClipNaarOefening); dát is de bewuste stap naar de gedeelde bibliotheek.

-- ── 1. Mappen ────────────────────────────────────────────────────────────────────────
create table if not exists public.clip_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

-- "Leg day", "leg day" en " Leg  Day " zijn dezelfde map. Zonder deze index krijgt iemand die twee
-- keer hetzelfde typt twee halve mappen, en dat merkt hij pas als de helft van zijn clips zoek is.
-- Dezelfde normalisatie zit in lib/clips.js (mapSleutel) zodat server en database het eens zijn.
create unique index if not exists clip_folders_user_name_key
  on public.clip_folders (user_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

-- ── 2. Clips ─────────────────────────────────────────────────────────────────────────
create table if not exists public.clips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- Map weg = clips blijven bestaan, ze belanden op "Zonder map". Een map verwijderen mag nooit
  -- stilletjes tien bewaarde links meenemen.
  folder_id  uuid references public.clip_folders(id) on delete set null,
  url        text not null check (url ~ '^https?://' and length(url) between 8 and 1000),
  provider   text not null check (provider in ('instagram', 'youtube', 'tiktok', 'video', 'link')),
  ref        text check (ref is null or length(ref) <= 64),   -- shortcode/video-id voor het kader
  title      text not null check (length(btrim(title)) between 1 and 120),
  note       text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);

-- Dezelfde link twee keer bewaren maakt geen tweede kaart: de bestaande verhuist naar de nieuwe map.
-- Dat is wat iemand bedoelt als hij een reel die hij al had opnieuw deelt vanuit Instagram.
create unique index if not exists clips_user_url_key on public.clips (user_id, url);
create index if not exists clips_user_created_idx on public.clips (user_id, created_at desc);
create index if not exists clips_folder_idx on public.clips (folder_id);

-- ── 3. RLS: alleen je eigen plank ────────────────────────────────────────────────────
-- Bewust vier aparte policies per tabel in plaats van één `for all`: een enkele policy met een
-- using-clausule laat een INSERT namens iemand anders toe zolang de rij bij het teruglezen matcht.
-- Zelfde lijn als exercise_favorites (0131).
alter table public.clip_folders enable row level security;
alter table public.clips        enable row level security;

drop policy if exists cf_select_own on public.clip_folders;
create policy cf_select_own on public.clip_folders for select using (auth.uid() = user_id);
drop policy if exists cf_insert_own on public.clip_folders;
create policy cf_insert_own on public.clip_folders for insert with check (auth.uid() = user_id);
drop policy if exists cf_update_own on public.clip_folders;
create policy cf_update_own on public.clip_folders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists cf_delete_own on public.clip_folders;
create policy cf_delete_own on public.clip_folders for delete using (auth.uid() = user_id);

drop policy if exists cl_select_own on public.clips;
create policy cl_select_own on public.clips for select using (auth.uid() = user_id);
drop policy if exists cl_insert_own on public.clips;
create policy cl_insert_own on public.clips for insert with check (auth.uid() = user_id);
drop policy if exists cl_update_own on public.clips;
create policy cl_update_own on public.clips for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists cl_delete_own on public.clips;
create policy cl_delete_own on public.clips for delete using (auth.uid() = user_id);

-- Supabase deelt op elke nieuwe tabel in public automatisch rechten uit aan anon én authenticated
-- (zie de waarschuwing in 0142). RLS houdt een uitgelogde bezoeker sowieso tegen — auth.uid() is
-- dan null — maar een bibliotheek heeft voor anon geen enkele reden om bereikbaar te zijn.
revoke all on table public.clip_folders from anon;
revoke all on table public.clips        from anon;

comment on table public.clips is
  'Persoonlijk bewaarde videolinks (Instagram/YouTube/TikTok/bestand). Alleen de link en de eigen titel; nooit het materiaal zelf.';
