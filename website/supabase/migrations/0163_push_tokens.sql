-- 0163 — Pushtokens voor de native app (iOS via APNs, Android via FCM).
--
-- WAAROM. De app (docs/native) stuurt elke in-app-melding ook als push (lib/notify.js →
-- lib/push.js). Daarvoor moet de server per toestel de token kennen. Eén rij per (lid, token):
-- hetzelfde toestel kan na uit- en inloggen van account wisselen, en één lid kan twee toestellen
-- hebben.
--
-- `environment` bestaat omdat APNs twee werelden heeft: een Xcode-debugbuild krijgt sandbox-tokens,
-- TestFlight en de App Store productietokens. Wie dat niet per token bijhoudt, stuurt de ene soort
-- naar de verkeerde server en krijgt BadDeviceToken — wat dan ten onrechte als "dood" wordt gezien.
--
-- `active` in plaats van verwijderen: de app registreert zich bij elke start opnieuw (upsert), en
-- dat is precies wat een per vergissing uitgezette token weer tot leven wekt.
--
-- Alleen de service-role komt eraan (de route /api/me/push controleert eerst wie je bent). Een lid
-- heeft zijn tokens nooit rechtstreeks nodig, dus RLS aan zonder policies en geen grants voor
-- anon/authenticated.

create table if not exists public.push_tokens (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid references public.gyms (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  token         text not null check (length(token) between 1 and 4096),
  platform      text not null check (platform in ('ios', 'android')),
  environment   text not null default 'production' check (environment in ('production', 'development')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (user_id, token)
);

comment on table public.push_tokens is
  'Pushtokens van de native app, één per (lid, toestel-token). Enkel via service-role (lib/push.js, /api/me/push).';

-- Het zenden zoekt altijd "alle actieve tokens van deze leden". De unique (user_id, token) dekt
-- user_id al als eerste kolom; deze partiële index houdt de zoektocht klein naarmate er oude,
-- uitgezette tokens bijkomen.
create index if not exists push_tokens_user_active_idx
  on public.push_tokens (user_id) where active;

create index if not exists push_tokens_gym_idx on public.push_tokens (gym_id);

alter table public.push_tokens enable row level security;

revoke all on table public.push_tokens from anon, authenticated;
grant select, insert, update, delete on table public.push_tokens to service_role;
