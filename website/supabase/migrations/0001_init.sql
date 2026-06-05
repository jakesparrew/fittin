-- Fittin' platform — initial schema (multi-tenant from day one)
-- Stack: Supabase Postgres + Auth + RLS. Money in cents (int). Times in UTC (render Europe/Brussels).
-- Convention: every domain table carries gym_id. RLS scopes rows to the caller's gym + role.
-- Phase-1 features are fully wired (accounts, bookings); phase-2/3 tables exist with
-- baseline RLS so the rest of the pitch deck slots in without a schema rewrite.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role      as enum ('lid', 'coach', 'beheerder');
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_type   as enum ('fit60', 'pt', 'event');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum ('bevestigd', 'geannuleerd', 'no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_source as enum ('los', 'credit', 'abo', 'gratis_code');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

-- Tenant. Fittin' is gym #1; new gyms are just new rows.
create table if not exists gyms (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  address           text,
  open_hour         int  not null default 7,    -- first bookable start hour
  close_hour        int  not null default 21,   -- gym closes (last start = close_hour-1)
  slot_minutes      int  not null default 75,   -- session length (1u15)
  daluur_until_hour int  not null default 16,   -- starts before this hour are "daluur"
  created_at        timestamptz not null default now()
);

-- One row per auth user. Created automatically on signup (see handle_new_user).
create table if not exists profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  gym_id             uuid not null references gyms(id),
  role               user_role not null default 'lid',
  full_name          text,
  email              text,
  phone              text,
  referral_code      text unique,
  welcome_code_used  boolean not null default false,  -- FittinWelcome (first session free)
  stripe_customer_id text,
  created_at         timestamptz not null default now()
);
create index if not exists profiles_gym_idx on profiles(gym_id);

-- Bookable services. fit60 = reserve the whole gym; pt/event slot in later.
create table if not exists services (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  type         service_type not null,
  key          text not null,            -- stable code e.g. 'fit60'
  name         text not null,
  duration_min int  not null default 75,
  price_cents  int  not null,
  capacity     int  not null default 4,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (gym_id, key)
);
create index if not exists services_gym_idx on services(gym_id);

-- The booking. Exclusive private gym => at most one confirmed booking per slot.
create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id) on delete cascade,
  service_id     uuid not null references services(id),
  user_id        uuid not null references profiles(id) on delete cascade,
  coach_id       uuid references profiles(id),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         booking_status not null default 'bevestigd',
  persons        int not null default 1,
  payment_source payment_source not null default 'los',
  price_cents    int not null default 0,
  paid           boolean not null default false,
  stripe_session_id     text,
  stripe_payment_intent text,
  notes          text,
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz
);
create index if not exists bookings_gym_start_idx on bookings(gym_id, starts_at);
create index if not exists bookings_user_idx on bookings(user_id);
-- Exclusivity: only one *confirmed* booking may occupy a given start slot per gym.
create unique index if not exists bookings_exclusive_slot
  on bookings(gym_id, starts_at) where (status = 'bevestigd');

-- Single currency: every credit movement is a row; balance = sum(delta).
create table if not exists credits_ledger (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  delta      int  not null,                 -- +bijschrijven / -gebruik
  reason     text not null,                 -- aankoop|abo|gebruik|challenge|referral|refund
  ref_id     uuid,                           -- booking/challenge/etc.
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists credits_user_idx on credits_ledger(user_id);

-- ---------------------------------------------------------------------------
-- Phase 1.x — payments / membership (schema ready; wired with Stripe later)
-- ---------------------------------------------------------------------------
create table if not exists memberships (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  stripe_sub_id  text,
  status         text not null default 'actief',
  started_at     timestamptz not null default now(),
  current_period_end timestamptz
);
create index if not exists memberships_user_idx on memberships(user_id);

create table if not exists punch_cards (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references gyms(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  credits_initial  int not null,
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Phase 2 — coaching (schema ready)
-- ---------------------------------------------------------------------------
create table if not exists coach_availability (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references gyms(id) on delete cascade,
  coach_id  uuid not null references profiles(id) on delete cascade,
  weekday   int  not null,           -- 0=zo .. 6=za
  from_hour int  not null,
  to_hour   int  not null
);

create table if not exists exercises (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  name        text not null,
  muscle      text,
  video_url   text,
  created_at  timestamptz not null default now()
);

create table if not exists programs (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  coach_id    uuid references profiles(id),
  member_id   uuid references profiles(id),
  name        text not null,
  is_template boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists program_days (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  day_no     int not null,
  name       text
);

create table if not exists program_exercises (
  id              uuid primary key default gen_random_uuid(),
  program_day_id  uuid not null references program_days(id) on delete cascade,
  exercise_id     uuid not null references exercises(id),
  sets            int,
  reps            int,
  rest_sec        int,
  position        int not null default 0
);

create table if not exists workout_logs (
  id                  uuid primary key default gen_random_uuid(),
  gym_id              uuid not null references gyms(id) on delete cascade,
  user_id             uuid not null references profiles(id) on delete cascade,
  program_exercise_id uuid references program_exercises(id),
  logged_on           date not null default current_date,
  sets_json           jsonb,         -- [{set, reps, weight_kg}]
  is_pr               boolean not null default false,
  created_at          timestamptz not null default now()
);
create index if not exists workout_logs_user_idx on workout_logs(user_id);

create table if not exists session_notes (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id) on delete cascade,
  coach_id       uuid not null references profiles(id),
  user_id        uuid not null references profiles(id) on delete cascade,
  booking_id     uuid references bookings(id),
  workout_log_id uuid references workout_logs(id),
  body           text not null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Phase 3 — community & growth (schema ready)
-- ---------------------------------------------------------------------------
create table if not exists challenges (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references gyms(id) on delete cascade,
  name            text not null,
  goal_type       text not null,        -- sessions|daluren|streak
  goal_count      int  not null,
  starts_on       date,
  ends_on         date,
  reward_credits  int  not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists challenge_progress (
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  progress     int not null default 0,
  reached_at   timestamptz,
  primary key (challenge_id, user_id)
);

create table if not exists referrals (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  referrer_id  uuid not null references profiles(id) on delete cascade,
  referred_id  uuid references profiles(id),
  status       text not null default 'pending',  -- pending|rewarded
  rewarded_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- Events are services of type 'event'; members register against the event's booking.
create table if not exists event_registrations (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references gyms(id) on delete cascade,
  event_booking_id uuid not null references bookings(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  paid             boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (event_booking_id, user_id)
);

-- Nuki door access log (phase 1 flagship; app calls server-side, never client keys).
create table if not exists door_log (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  user_id    uuid references profiles(id),
  booking_id uuid references bookings(id),
  opened_at  timestamptz not null default now(),
  result     text not null default 'ok'   -- ok|denied|error
);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER → bypass RLS, no recursive policy on profiles)
-- ---------------------------------------------------------------------------
create or replace function public.current_gym_id()
returns uuid language sql stable security definer set search_path = public as $$
  select gym_id from profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('coach','beheerder') from profiles where id = auth.uid()), false);
$$;

-- Auto-create a profile on signup, attached to the Fittin' gym, role = lid.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  default_gym uuid;
begin
  select id into default_gym from gyms order by created_at asc limit 1;
  insert into public.profiles (id, gym_id, role, full_name, email, referral_code)
  values (
    new.id,
    default_gym,
    'lid',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email,
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table gyms                enable row level security;
alter table profiles            enable row level security;
alter table services            enable row level security;
alter table bookings            enable row level security;
alter table credits_ledger      enable row level security;
alter table memberships         enable row level security;
alter table punch_cards         enable row level security;
alter table coach_availability  enable row level security;
alter table exercises           enable row level security;
alter table programs            enable row level security;
alter table program_days        enable row level security;
alter table program_exercises   enable row level security;
alter table workout_logs        enable row level security;
alter table session_notes       enable row level security;
alter table challenges          enable row level security;
alter table challenge_progress  enable row level security;
alter table referrals           enable row level security;
alter table event_registrations enable row level security;
alter table door_log            enable row level security;

-- gyms + services are public reference data (needed to browse availability before login).
create policy gyms_select on gyms for select using (true);
create policy gyms_update on gyms for update using (id = current_gym_id() and is_staff());

-- profiles: self always; staff sees everyone in their gym.
create policy profiles_select on profiles for select
  using (id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy profiles_insert on profiles for insert
  with check (id = auth.uid());
create policy profiles_update on profiles for update
  using (id = auth.uid() or (gym_id = current_gym_id() and is_staff()));

-- services: publicly readable (browse what's bookable); managed by staff.
create policy services_select on services for select using (true);
create policy services_write  on services for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());

-- bookings: own + staff read; members create/cancel their own; staff manage all.
create policy bookings_select on bookings for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy bookings_insert on bookings for insert
  with check (user_id = auth.uid() and gym_id = current_gym_id());
create policy bookings_update on bookings for update
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));

-- credits: read own + staff. Writes go through service role (server) only.
create policy credits_select on credits_ledger for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));

-- workout logs: member writes own; staff reads gym.
create policy logs_select on workout_logs for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy logs_write on workout_logs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and gym_id = current_gym_id());

-- Generic "own-or-staff read" for the remaining member-scoped tables.
create policy memberships_select on memberships for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy punch_cards_select on punch_cards for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy challenge_progress_select on challenge_progress for select
  using (user_id = auth.uid() or is_staff());
create policy referrals_select on referrals for select
  using (referrer_id = auth.uid() or referred_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy event_reg_select on event_registrations for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy event_reg_write on event_registrations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and gym_id = current_gym_id());
create policy door_log_select on door_log for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));

-- Gym-wide readable reference data (managed by staff).
create policy coach_avail_select on coach_availability for select using (gym_id = current_gym_id());
create policy coach_avail_write  on coach_availability for all
  using (gym_id = current_gym_id() and is_staff()) with check (gym_id = current_gym_id() and is_staff());
create policy exercises_select on exercises for select using (gym_id = current_gym_id());
create policy exercises_write  on exercises for all
  using (gym_id = current_gym_id() and is_staff()) with check (gym_id = current_gym_id() and is_staff());
create policy challenges_select on challenges for select using (gym_id = current_gym_id());
create policy challenges_write  on challenges for all
  using (gym_id = current_gym_id() and is_staff()) with check (gym_id = current_gym_id() and is_staff());

-- programs + nested: staff manage; assigned member can read their own program.
create policy programs_select on programs for select
  using (member_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy programs_write on programs for all
  using (gym_id = current_gym_id() and is_staff()) with check (gym_id = current_gym_id() and is_staff());
create policy program_days_select on program_days for select
  using (exists (select 1 from programs p where p.id = program_id
         and (p.member_id = auth.uid() or (p.gym_id = current_gym_id() and is_staff()))));
create policy program_days_write on program_days for all
  using (exists (select 1 from programs p where p.id = program_id and p.gym_id = current_gym_id() and is_staff()))
  with check (exists (select 1 from programs p where p.id = program_id and p.gym_id = current_gym_id() and is_staff()));
create policy program_ex_select on program_exercises for select
  using (exists (select 1 from program_days d join programs p on p.id = d.program_id
         where d.id = program_day_id and (p.member_id = auth.uid() or (p.gym_id = current_gym_id() and is_staff()))));
create policy program_ex_write on program_exercises for all
  using (exists (select 1 from program_days d join programs p on p.id = d.program_id
         where d.id = program_day_id and p.gym_id = current_gym_id() and is_staff()))
  with check (exists (select 1 from program_days d join programs p on p.id = d.program_id
         where d.id = program_day_id and p.gym_id = current_gym_id() and is_staff()));
create policy session_notes_select on session_notes for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
create policy session_notes_write on session_notes for all
  using (gym_id = current_gym_id() and is_staff()) with check (gym_id = current_gym_id() and is_staff());

-- ---------------------------------------------------------------------------
-- Booking RPCs
-- ---------------------------------------------------------------------------

-- Confirmed slot start-times for a gym in a window (only timestamps, no PII).
-- Lets anyone compute availability without reading others' booking rows.
create or replace function public.gym_taken_slots(p_gym uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.starts_at from bookings b
  where b.gym_id = p_gym and b.status = 'bevestigd'
    and b.starts_at >= p_from and b.starts_at < p_to;
$$;
grant execute on function public.gym_taken_slots(uuid, timestamptz, timestamptz) to anon, authenticated;

-- Create a booking. Constructs the slot in Europe/Brussels (DST-correct), enforces
-- opening hours / not-in-past, applies the FittinWelcome free first session, and relies
-- on the partial unique index to make concurrent double-booking impossible.
-- Raises with a friendly message that the UI surfaces directly.
create or replace function public.create_booking(
  p_service uuid,
  p_date    date,
  p_hour    int,
  p_persons int default 1,
  p_use_welcome boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_gym     uuid;
  v_used    boolean;
  v_srv     services%rowtype;
  v_open    int;
  v_close   int;
  v_start   timestamptz;
  v_end     timestamptz;
  v_free    boolean;
  v_price   int;
  v_source  payment_source;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'Je moet ingelogd zijn om te boeken.' using errcode = 'P0001';
  end if;

  select gym_id, welcome_code_used into v_gym, v_used from profiles where id = v_uid;
  if v_gym is null then
    raise exception 'Geen profiel gevonden.' using errcode = 'P0001';
  end if;

  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then
    raise exception 'Onbekende sessie.' using errcode = 'P0001';
  end if;

  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then
    raise exception 'Dit uur valt buiten de openingsuren.' using errcode = 'P0001';
  end if;

  if p_persons < 1 or p_persons > v_srv.capacity then
    raise exception 'Ongeldig aantal personen.' using errcode = 'P0001';
  end if;

  -- Wall-clock hour in Brussels -> timestamptz (handles DST automatically).
  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);

  if v_start < now() then
    raise exception 'Dit tijdslot is al verlopen.' using errcode = 'P0001';
  end if;

  v_free   := p_use_welcome and not coalesce(v_used, false) and v_srv.type = 'fit60';
  v_price  := case when v_free then 0 else v_srv.price_cents end;
  v_source := case when v_free then 'gratis_code'::payment_source else 'los'::payment_source end;

  begin
    insert into bookings (gym_id, service_id, user_id, starts_at, ends_at, persons, payment_source, price_cents, paid)
    values (v_gym, v_srv.id, v_uid, v_start, v_end, p_persons, v_source, v_price, v_free)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dit tijdslot is net geboekt. Kies een ander uur.' using errcode = 'P0001';
  end;

  if v_free then
    update profiles set welcome_code_used = true where id = v_uid;
  end if;

  return v_id;
end;
$$;
grant execute on function public.create_booking(uuid, date, int, int, boolean) to authenticated;
