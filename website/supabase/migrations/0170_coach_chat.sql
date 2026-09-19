-- 0170 — De AI-coach als gesprek: berichten, voorstellen met bevestiging, geheugen, en de schakelaar voor iedereen.
--
-- Plan en keuzes: docs/plans/2026-09-19-ai-coach-chat.md.
--   · Eén doorlopend gesprek per lid (coach_berichten). De coach mag enkel VOORSTELLEN (acties in `acties`);
--     uitvoeren gebeurt pas na een tik van het lid, server-side, met de rechten van het lid zelf.
--   · Het geheugen (coach_geheugen) is zichtbaar en wisbaar voor het lid. Bewust een eigen tabel en geen kolom op
--     profiles: profielen zijn deels leesbaar voor andere leden en coaches, dit geheugen enkel voor het lid zelf.
--   · gyms.ai_coach_open: de uitbater zet de coach aan of uit voor alle leden, zonder deploy (Beheer → AI-coach).
--     Standaard UIT: pas omzetten nadat de chat met zijn vangrails live staat (beslissing eigenaar 2026-09-19:
--     openzetten, duidelijk als testfase).

create table if not exists public.coach_berichten (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  rol         text not null check (rol in ('lid', 'coach', 'systeem')),
  tekst       text not null default '',
  -- [{ id, type, invoer, status: voorgesteld|uitgevoerd|geweigerd|verlopen|mislukt, resultaat }]
  acties      jsonb not null default '[]'::jsonb,
  vlag        text,              -- 'spoed' | 'pijn' | 'buiten_scope' | 'limiet' — voor het beheer, nooit voor het model
  created_at  timestamptz not null default now()
);
create index if not exists coach_berichten_lid_idx on public.coach_berichten (member_id, created_at desc);
create index if not exists coach_berichten_gym_idx on public.coach_berichten (gym_id, created_at desc);

alter table public.profiles add column if not exists coach_chat_akkoord_at timestamptz;
create table if not exists public.coach_geheugen (
  member_id   uuid primary key references public.profiles(id) on delete cascade,
  gym_id      uuid not null references public.gyms(id) on delete cascade,
  feiten      text[] not null default '{}',
  updated_at  timestamptz not null default now()
);

alter table public.gyms add column if not exists ai_coach_open boolean not null default false;

alter table public.coach_berichten enable row level security;
alter table public.coach_geheugen enable row level security;
drop policy if exists coach_geheugen_select on public.coach_geheugen;
create policy coach_geheugen_select on public.coach_geheugen for select using (member_id = auth.uid());
revoke all on public.coach_geheugen from public;
revoke all on public.coach_geheugen from anon;
revoke all on public.coach_geheugen from authenticated;
grant select on public.coach_geheugen to authenticated;
grant all on public.coach_geheugen to service_role;
drop policy if exists coach_berichten_select on public.coach_berichten;
create policy coach_berichten_select on public.coach_berichten for select using (member_id = auth.uid());

revoke all on public.coach_berichten from public;
revoke all on public.coach_berichten from anon;
revoke all on public.coach_berichten from authenticated;
grant select on public.coach_berichten to authenticated;
grant all on public.coach_berichten to service_role;
