-- 0150: het meldpunt na de sessie — categorieën, foto, terugkoppeling, en één sterrenvraag.
--
-- WAAROM: er is NIEMAND aanwezig tijdens een sessie. Is een toestel stuk, de zaal vuil of de deur
-- klem, dan is het volgende lid de dupe en hoort de uitbater het pas als iemand opzegt. Er bestond
-- al een meldknop, maar die zit dichtgeklapt op de accountpagina achter een leeg tekstvak —
-- gemeten resultaat: ÉÉN melding in vijf maanden, op 2026-08-13.
--
-- Wat er verandert:
--   1. Melden vanuit de deurcodemail, zonder in te loggen (token per boeking). Dat is de enige mail
--      die 100 % van de sessies bereikt en die iedereen opent, want de code staat erin.
--   2. Categorieën in plaats van een leeg veld — twee seconden tikken i.p.v. een alinea typen.
--   3. Terugkoppeling: "ik kijk ernaar" en "opgelost", allebei zichtbaar voor de melder. Dat is de
--      reden dat iemand een tweede keer meldt.
--   4. Een notitie die meereist in de deurcodemail van de VOLGENDE bezoeker ("de roeier staat
--      buiten dienst"), tot ze afgevinkt wordt.
--   5. Eén sterrenvraag na de sessie, met de reviewvraag daarna — voor IEDEREEN gelijk (zie de
--      nota bij session_feedback).

-- ── 1. problem_reports uitbreiden ────────────────────────────────────────────────────
alter table public.problem_reports add column if not exists category   text;
alter table public.problem_reports add column if not exists booking_id uuid references public.bookings(id) on delete set null;
alter table public.problem_reports add column if not exists photo_path  text;
alter table public.problem_reports add column if not exists acknowledged_at timestamptz;
alter table public.problem_reports add column if not exists public_note text;
alter table public.problem_reports add column if not exists resolved_note text;
alter table public.problem_reports add column if not exists resolved_at timestamptz;

comment on column public.problem_reports.public_note is
  'Regel die meereist in de deurcodemail van volgende bezoekers zolang de melding open staat. Nooit de tekst van het lid zelf — die kan een naam of een verwijt bevatten; dit is wat de uitbater zelf typt.';
comment on column public.problem_reports.acknowledged_at is
  '"Ik kijk ernaar" — losgekoppeld van afhandelen. Antwoorden zette een melding tot nu meteen op afgehandeld, dus je KON niet zeggen "ik ben ermee bezig".';

do $$ begin
  alter table public.problem_reports
    add constraint problem_reports_category_ck
    check (category is null or category in ('toestel', 'netheid', 'temperatuur', 'deur', 'anders'));
exception when duplicate_object then null; end $$;

create index if not exists problem_reports_open_idx on public.problem_reports (gym_id, resolved_at) where resolved_at is null;
create index if not exists problem_reports_booking_idx on public.problem_reports (booking_id);

-- ── 2. Meldtoken per boeking ─────────────────────────────────────────────────────────
-- Het token staat in de deurcodemail en is de toegangscontrole voor /m/<token>. Per BOEKING, niet
-- per lid: het verloopt dus vanzelf mee met de sessie, en een gelekt token opent nooit meer dan
-- één melding over één sessie.
alter table public.bookings add column if not exists report_token text unique;

-- Vullen voor alles wat nog moet plaatsvinden of net achter de rug is; de sweep vult de rest.
update public.bookings
   set report_token = encode(gen_random_bytes(16), 'hex')
 where report_token is null
   and status = 'bevestigd'
   and starts_at >= now() - interval '7 days';

-- ── 3. Sterrenvraag ──────────────────────────────────────────────────────────────────
-- Bewust EEN tabel met EEN score per boeking. Geen sterren per coach: bij 5 tot 9 sessies per
-- coach is elk gemiddelde ruis, en een publiek cijfer op een collega is een arbeidsrelatie, geen
-- productbeoordeling.
--
-- LET OP bij het bouwen van de reviewvraag: Google's beleid (support.google.com/contributionpolicy/
-- answer/7400114) verbiedt woordelijk "negatieve reviews ontmoedigen of verbieden, en selectief
-- vragen om positieve reviews". De reviewlink hoort dus op de bedankpagina van ELKE score, ook een
-- 1. Wie hier ooit een `where rating >= 4` bij zet, zet het bedrijfsprofiel op het spel.
create table if not exists public.session_feedback (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  rating     int  not null check (rating between 1 and 5),
  comment    text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (booking_id)
);

create index if not exists session_feedback_gym_idx on public.session_feedback (gym_id, created_at desc);

alter table public.session_feedback enable row level security;

drop policy if exists sf_select on public.session_feedback;
create policy sf_select on public.session_feedback for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
drop policy if exists sf_insert on public.session_feedback;
create policy sf_insert on public.session_feedback for insert
  with check (user_id = auth.uid() and gym_id = current_gym_id());

revoke all on table public.session_feedback from anon;

-- Wanneer is er om feedback gevraagd? Op de boeking, zodat de sweep idempotent is en een lid nooit
-- twee keer dezelfde vraag krijgt — ook niet als de cron twee keer in hetzelfde venster draait.
alter table public.bookings add column if not exists feedback_asked_at timestamptz;

-- Een lid mag deze mails uitzetten zonder zijn deurcodemails te verliezen. De bestaande schakelaar
-- op /account raakt uitsluitend nieuwsbrieven; art. 21 AVG vraagt een uitdrukkelijk, apart
-- aangeboden bezwaarrecht.
alter table public.profiles add column if not exists feedback_opt_out boolean not null default false;
grant update (feedback_opt_out) on public.profiles to authenticated;

-- ── 4. Foto's van een melding: privé ─────────────────────────────────────────────────
-- De drie bestaande buckets (coach-photos, event-images, feed-images) zijn allemaal PUBLIEK. Een
-- foto van een vuile kleedkamer of een kapot toestel kan mensen bevatten en hoort niet achter een
-- raadbare publieke URL. Vandaar een eigen, niet-publieke bucket; de beheerpagina toont ze via een
-- ondertekende link die vanzelf verloopt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meldingen', 'meldingen', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 8388608;

-- Alleen personeel leest de bak; schrijven gebeurt uitsluitend met de service-role vanaf de server
-- (het lid uploadt via een server action, nooit rechtstreeks naar storage).
drop policy if exists meldingen_staff_select on storage.objects;
create policy meldingen_staff_select on storage.objects for select
  using (bucket_id = 'meldingen' and public.is_staff());
