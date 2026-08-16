-- Inzichten op het dashboard kunnen tijdelijk verborgen worden ("verberg 60 dagen").
--
-- Waarom: een actiekaart waar je bewust niets mee doet ("Floris wil geen abo, al gevraagd")
-- blijft anders elke dag terugkomen. Een actielijst die je niet leeg kán maken, leer je negeren —
-- en dan mis je ook de kaarten die wél dringend zijn. Verbergen is per lid én per soort inzicht,
-- en verloopt vanzelf: na de termijn mag de kaart terugkomen, want dan is de situatie mogelijk
-- veranderd.
--
-- Service-role-only (RLS aan, geen policies): alleen de server schrijft en leest dit,
-- via de beheerder-guard in de server actions.

create table if not exists public.insight_snoozes (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  kind text not null,            -- 'abo_kandidaat' | 'opzeg' | 'winback' | ...
  user_id uuid not null references public.profiles(id) on delete cascade,
  until timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (gym_id, kind, user_id)
);

alter table public.insight_snoozes enable row level security;

-- Geen extra index: de unique-constraint (gym_id, kind, user_id) dekt de opzoekingen al, en
-- een partial index op `until > now()` kan niet (now() is niet immutable).
