-- 0007: payment packages (losse boeking / 10-beurtenkaart / abonnement) + pay-with-credit.
-- Prepares bundles & subscriptions; only what's "active" shows to members.

create table if not exists packages (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  kind        text not null,              -- 'beurtenkaart' | 'abonnement'
  name        text not null,
  price_cents int  not null,
  credits     int  not null default 0,    -- credits granted on purchase (per period for abo)
  period      text not null default 'once', -- 'once' | 'maand'
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
alter table packages enable row level security;
drop policy if exists packages_select on packages;
create policy packages_select on packages for select using (true);
drop policy if exists packages_write on packages;
create policy packages_write on packages for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());

-- Seed default packages for Fittin'.
with g as (select id from gyms where slug = 'fittin')
insert into packages (gym_id, kind, name, price_cents, credits, period, active, sort)
select g.id, v.kind, v.name, v.price_cents, v.credits, v.period, v.active, v.sort
from g, (values
  ('beurtenkaart'::text, '10-beurtenkaart'::text, 10000, 10, 'once'::text,  true,  1),
  ('abonnement',         'Member-abonnement',      1000,  1, 'maand',       false, 2)
) as v(kind, name, price_cents, credits, period, active, sort)
on conflict do nothing;

-- Recreate create_booking with pay-with-credit support.
drop function if exists public.create_booking(uuid, date, int, int, boolean, uuid);
create or replace function public.create_booking(
  p_service uuid,
  p_date    date,
  p_hour    int,
  p_persons int default 1,
  p_use_welcome boolean default false,
  p_coach   uuid default null,
  p_use_credit boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid; v_used boolean; v_srv services%rowtype;
  v_open int; v_close int; v_start timestamptz; v_end timestamptz;
  v_free boolean; v_price int; v_source payment_source; v_id uuid; v_bal int;
begin
  if v_uid is null then raise exception 'Je moet ingelogd zijn om te boeken.' using errcode='P0001'; end if;
  select gym_id, welcome_code_used into v_gym, v_used from profiles where id = v_uid;
  if v_gym is null then raise exception 'Geen profiel gevonden.' using errcode='P0001'; end if;
  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Dit uur valt buiten de openingsuren.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

  v_free := p_use_welcome and not coalesce(v_used, false) and v_srv.type = 'fit60';

  if v_free then
    v_price := 0; v_source := 'gratis_code';
  elsif p_use_credit then
    select coalesce(sum(delta), 0) into v_bal from credits_ledger where user_id = v_uid;
    if v_bal < 1 then raise exception 'Onvoldoende credits.' using errcode='P0001'; end if;
    v_price := 0; v_source := 'credit';
  else
    v_price := v_srv.price_cents; v_source := 'los';
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid)
    values (v_gym, v_srv.id, v_uid, p_coach, v_start, v_end, p_persons, v_source, v_price, v_free or p_use_credit)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dit tijdslot is net geboekt. Kies een ander uur.' using errcode='P0001';
  end;

  if v_free then update profiles set welcome_code_used = true where id = v_uid; end if;
  if v_source = 'credit' then
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id) values (v_gym, v_uid, -1, 'gebruik', v_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.create_booking(uuid, date, int, int, boolean, uuid, boolean) to authenticated;
