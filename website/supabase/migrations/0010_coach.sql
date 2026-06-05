-- 0010: coach section — coaches book sessions for their clients with per-coach billing.

-- Per-coach billing config (set by the superadmin).
alter table profiles add column if not exists coach_billing_mode text not null default 'invoice'; -- free | credit | invoice
alter table profiles add column if not exists coach_session_price_cents int not null default 0;

-- Coach session-credit ledger (for the 'credit' mode + purchases/grants). Balance = sum(delta).
create table if not exists coach_ledger (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  coach_id   uuid not null references profiles(id) on delete cascade,
  delta      int  not null,
  reason     text not null,         -- aankoop | grant | sessie | correctie
  ref_id     uuid,
  created_at timestamptz not null default now()
);
create index if not exists coach_ledger_idx on coach_ledger(coach_id);
alter table coach_ledger enable row level security;
drop policy if exists coach_ledger_select on coach_ledger;
create policy coach_ledger_select on coach_ledger for select
  using (coach_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
drop policy if exists coach_ledger_insert_staff on coach_ledger;
create policy coach_ledger_insert_staff on coach_ledger for insert
  with check (gym_id = current_gym_id() and is_staff());

-- How a coach-initiated booking is billed (recorded on the booking).
alter table bookings add column if not exists coach_billing text;            -- free | credit | invoice
alter table bookings add column if not exists coach_charge_cents int not null default 0;

create or replace function public.coach_credit_balance(p_coach uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)::int from coach_ledger where coach_id = p_coach;
$$;
grant execute on function public.coach_credit_balance(uuid) to authenticated;

-- A coach books a session for one of their clients (member). The client doesn't pay;
-- the coach is billed per their mode (free / deduct a coach-session-credit / add to monthly invoice).
create or replace function public.coach_book_session(
  p_client  uuid,
  p_service uuid,
  p_date    date,
  p_hour    int,
  p_persons int default 1
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_gym uuid; v_role user_role; v_mode text; v_price int;
  v_srv services%rowtype; v_open int; v_close int;
  v_start timestamptz; v_end timestamptz; v_id uuid; v_bal int; v_billing text; v_charge int;
begin
  select gym_id, role, coach_billing_mode, coach_session_price_cents
    into v_gym, v_role, v_mode, v_price from profiles where id = v_coach;
  if v_role not in ('coach', 'beheerder') then raise exception 'Alleen coaches kunnen dit.' using errcode='P0001'; end if;
  if not exists (select 1 from profiles where id = p_client and gym_id = v_gym) then
    raise exception 'Onbekende client.' using errcode='P0001'; end if;

  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;

  if v_mode = 'free' then
    v_billing := 'free'; v_charge := 0;
  elsif v_mode = 'credit' then
    select coalesce(sum(delta), 0) into v_bal from coach_ledger where coach_id = v_coach;
    if v_bal < 1 then raise exception 'Onvoldoende coach-sessies. Koop er bij of vraag de beheerder.' using errcode='P0001'; end if;
    v_billing := 'credit'; v_charge := 0;
  else
    v_billing := 'invoice'; v_charge := coalesce(v_price, 0);
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid, coach_billing, coach_charge_cents)
    values (v_gym, v_srv.id, p_client, v_coach, v_start, v_end, p_persons, 'los', 0, true, v_billing, v_charge)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if v_billing = 'credit' then
    insert into coach_ledger (gym_id, coach_id, delta, reason, ref_id) values (v_gym, v_coach, -1, 'sessie', v_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.coach_book_session(uuid, uuid, date, int, int) to authenticated;
