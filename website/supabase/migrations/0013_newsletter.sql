-- 0013: newsletter + campaigns + drip sequences. Every member is auto-subscribed; the
-- superadmin composes/sends newsletters and runs drip sequences, with stats from Resend events.

-- ---------- Subscribers (the audience) ----------
create table if not exists subscribers (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  email      text not null,
  name       text,
  status     text not null default 'active',  -- active | unsubscribed | bounced
  source     text not null default 'auto',    -- auto (member) | signup (public) | import
  unsub_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (gym_id, email)
);
create index if not exists subscribers_gym_idx on subscribers(gym_id, status);
alter table subscribers enable row level security;
drop policy if exists subscribers_staff on subscribers;
create policy subscribers_staff on subscribers for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());

-- Auto-subscribe every profile (member). Writes via security-definer trigger.
create or replace function public.sync_subscriber_from_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null then return new; end if;
  insert into subscribers (gym_id, user_id, email, name, source)
  values (new.gym_id, new.id, lower(new.email), new.full_name, 'auto')
  on conflict (gym_id, email) do update
    set user_id = excluded.user_id,
        name = coalesce(subscribers.name, excluded.name);
  return new;
end; $$;
drop trigger if exists on_profile_subscribe on profiles;
create trigger on_profile_subscribe after insert on profiles
  for each row execute function public.sync_subscriber_from_profile();

-- Backfill existing members.
insert into subscribers (gym_id, user_id, email, name, source)
select gym_id, id, lower(email), full_name, 'auto' from profiles where email is not null
on conflict (gym_id, email) do nothing;

-- ---------- Campaigns (newsletter blasts + drip sequences) ----------
create table if not exists campaigns (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  kind       text not null default 'newsletter',  -- newsletter | drip
  name       text not null,
  subject    text,
  preheader  text,
  body_html  text,                                 -- newsletter body (compiled)
  status     text not null default 'draft',        -- draft | scheduled | sending | sent | active | paused
  scheduled_at timestamptz,
  sent_at    timestamptz,
  trigger    text not null default 'on_signup',    -- drip trigger (on_signup)
  -- denormalized stats for fast display
  total int not null default 0, sent int not null default 0, delivered int not null default 0,
  opened int not null default 0, clicked int not null default 0, bounced int not null default 0,
  unsubscribed int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campaigns_gym_idx on campaigns(gym_id, created_at desc);
alter table campaigns enable row level security;
drop policy if exists campaigns_staff on campaigns;
create policy campaigns_staff on campaigns for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());

-- Drip steps (ordered emails sent N hours after enrollment).
create table if not exists campaign_steps (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  step_no     int not null,
  delay_hours int not null default 0,
  subject     text not null,
  body_html   text not null,
  unique (campaign_id, step_no)
);
alter table campaign_steps enable row level security;
drop policy if exists campaign_steps_staff on campaign_steps;
create policy campaign_steps_staff on campaign_steps for all
  using (exists (select 1 from campaigns c where c.id = campaign_id and c.gym_id = current_gym_id() and is_staff()))
  with check (exists (select 1 from campaigns c where c.id = campaign_id and c.gym_id = current_gym_id() and is_staff()));

-- Per-recipient send log — source of truth for stats + dedup.
create table if not exists campaign_sends (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  step_id       uuid references campaign_steps(id) on delete cascade, -- null for newsletter
  subscriber_id uuid references subscribers(id) on delete set null,
  email         text not null,
  resend_id     text,
  status        text not null default 'queued', -- queued|scheduled|sent|delivered|opened|clicked|bounced|failed
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (campaign_id, subscriber_id, step_id)
);
create index if not exists campaign_sends_resend_idx on campaign_sends(resend_id);
create index if not exists campaign_sends_campaign_idx on campaign_sends(campaign_id);
alter table campaign_sends enable row level security;
drop policy if exists campaign_sends_staff on campaign_sends;
create policy campaign_sends_staff on campaign_sends for select
  using (gym_id = current_gym_id() and is_staff());

-- Drip enrollments (which subscriber is progressing through which drip).
create table if not exists drip_enrollments (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  status        text not null default 'active', -- active | completed | cancelled
  enrolled_at   timestamptz not null default now(),
  unique (campaign_id, subscriber_id)
);
alter table drip_enrollments enable row level security;
drop policy if exists drip_enrollments_staff on drip_enrollments;
create policy drip_enrollments_staff on drip_enrollments for select
  using (gym_id = current_gym_id() and is_staff());
