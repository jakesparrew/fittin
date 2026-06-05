-- 0008: Stripe billing — member pricing, subscription wiring, webhook idempotency.

-- Member rate (e.g. fit60 €8 for subscribers).
alter table services add column if not exists member_price_cents int;
update services set member_price_cents = 800 where key = 'fit60' and member_price_cents is null;

-- Link a package to a Stripe recurring price (for subscriptions).
alter table packages add column if not exists stripe_price_id text;

-- Membership extras.
alter table memberships add column if not exists cancel_at_period_end boolean not null default false;
alter table memberships add column if not exists price_id text;

-- Idempotency: remember processed Stripe events.
create table if not exists stripe_events (
  id         text primary key,
  type       text,
  created_at timestamptz not null default now()
);
alter table stripe_events enable row level security; -- service-role only, no policies

-- Does this user have an active subscription right now?
create or replace function public.has_active_membership(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where user_id = p_uid and status = 'actief'
      and (current_period_end is null or current_period_end > now())
  );
$$;
grant execute on function public.has_active_membership(uuid) to authenticated;

-- Recreate create_booking with member pricing (subscribers pay member rate).
drop function if exists public.create_booking(uuid, date, int, int, boolean, uuid, boolean);
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
  v_free boolean; v_price int; v_source payment_source; v_id uuid; v_bal int; v_member boolean;
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
  v_member := has_active_membership(v_uid);

  if v_free then
    v_price := 0; v_source := 'gratis_code';
  elsif p_use_credit then
    select coalesce(sum(delta), 0) into v_bal from credits_ledger where user_id = v_uid;
    if v_bal < 1 then raise exception 'Onvoldoende sessies.' using errcode='P0001'; end if;
    v_price := 0; v_source := 'credit';
  elsif v_member and v_srv.member_price_cents is not null then
    v_price := v_srv.member_price_cents; v_source := 'abo';
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
