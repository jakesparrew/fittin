-- 0004: community & growth — events/group classes + signups.
-- (challenges, challenge_progress, referrals already exist from 0001.)

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  title       text not null,
  description text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  capacity    int not null default 12,
  price_cents int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists events_gym_idx on events(gym_id, starts_at);
alter table events enable row level security;
drop policy if exists events_select on events;
create policy events_select on events for select using (true);
drop policy if exists events_write on events;
create policy events_write on events for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());

create table if not exists event_signups (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  event_id   uuid not null references events(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  paid       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
alter table event_signups enable row level security;
drop policy if exists event_signups_select on event_signups;
create policy event_signups_select on event_signups for select
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
drop policy if exists event_signups_insert on event_signups;
create policy event_signups_insert on event_signups for insert
  with check (user_id = auth.uid() and gym_id = current_gym_id());
drop policy if exists event_signups_delete on event_signups;
create policy event_signups_delete on event_signups for delete
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));

-- Redeem a referral code: both members get +1 credit, once per new member.
create or replace function public.redeem_referral(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid;
  v_referrer uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = v_uid;
  if exists (select 1 from referrals where referred_id = v_uid) then
    raise exception 'Je hebt al een code gebruikt.' using errcode='P0001';
  end if;
  select id into v_referrer from profiles where upper(referral_code) = upper(p_code) and gym_id = v_gym;
  if v_referrer is null then raise exception 'Onbekende code.' using errcode='P0001'; end if;
  if v_referrer = v_uid then raise exception 'Je eigen code telt niet.' using errcode='P0001'; end if;

  insert into referrals (gym_id, referrer_id, referred_id, status, rewarded_at)
  values (v_gym, v_referrer, v_uid, 'rewarded', now());
  insert into credits_ledger (gym_id, user_id, delta, reason) values
    (v_gym, v_uid, 1, 'referral'),
    (v_gym, v_referrer, 1, 'referral');
  return 'ok';
end; $$;
grant execute on function public.redeem_referral(text) to authenticated;
