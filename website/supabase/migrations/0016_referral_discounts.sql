-- 0016: anti-farm referral guard + discount codes (incl. activation win-back discounts).

-- ---- Referral: only brand-new members may redeem (stops two members farming each other) ----
create or replace function public.redeem_referral(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid; v_referrer uuid; v_created timestamptz;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id, created_at into v_gym, v_created from profiles where id = v_uid;
  if exists (select 1 from referrals where referred_id = v_uid) then
    raise exception 'Je hebt al een code gebruikt.' using errcode='P0001';
  end if;
  -- Anti-farming: a referral code only rewards a genuinely new account.
  if exists (select 1 from bookings where user_id = v_uid) then
    raise exception 'Een vriendcode geldt enkel voor nieuwe leden die nog niet boekten.' using errcode='P0001';
  end if;
  if v_created < now() - interval '21 days' then
    raise exception 'Vriendcodes zijn enkel geldig in je eerste weken bij Fittin''.' using errcode='P0001';
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

-- ---- Discount codes ----
create table if not exists discount_codes (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  code          text not null,                 -- stored uppercase
  percent       int  not null default 0,        -- 0..100 off the session price
  max_uses      int,                            -- null = unlimited
  used_count    int  not null default 0,
  per_user_once boolean not null default true,
  expires_at    timestamptz,
  active        boolean not null default true,
  campaign_id   uuid references campaigns(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (gym_id, code)
);
alter table discount_codes enable row level security;
drop policy if exists discount_codes_staff on discount_codes;
create policy discount_codes_staff on discount_codes for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());

create table if not exists discount_redemptions (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  code_id    uuid not null references discount_codes(id) on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  booking_id uuid,
  created_at timestamptz not null default now()
);
alter table discount_redemptions enable row level security;
drop policy if exists discount_redemptions_staff on discount_redemptions;
create policy discount_redemptions_staff on discount_redemptions for select
  using (gym_id = current_gym_id() and is_staff());

-- Activation campaigns can carry a win-back discount (e.g. 50% off after a month inactive).
alter table campaigns add column if not exists discount_percent int not null default 0;
alter table campaigns add column if not exists discount_code text;
