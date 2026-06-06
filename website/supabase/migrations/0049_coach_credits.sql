-- 0049: coach credits — a coachee prepays a bundle of sessions WITH a specific coach, so the coach
-- can book them without charging each time. The room fee stays the coach's own billing mode.
-- Two independent ledgers:
--   coach_ledger        = coach pays the GYM (room) — existing.
--   coach_credit_ledger = coachee prepays the COACH (this file).

-- Per-coachee prepaid balance with a coach (balance = sum(delta)).
create table if not exists coach_credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  coach_id   uuid not null references profiles(id) on delete cascade,
  client_id  uuid not null references profiles(id) on delete cascade,
  delta      int  not null,                 -- +N on top-up, -1 per booked session
  reason     text not null default 'aankoop',
  ref_id     uuid,
  created_at timestamptz not null default now()
);
create index if not exists ccl_coach_client_idx on coach_credit_ledger(coach_id, client_id);
alter table coach_credit_ledger enable row level security;
drop policy if exists ccl_select on coach_credit_ledger;
create policy ccl_select on coach_credit_ledger for select
  using (coach_id = auth.uid() or client_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
-- Writes happen via security-definer RPC (booking) or service role (webhook top-up) only.

-- A payment invite can top up N coach-sessions (0 = a plain one-off charge, as before).
alter table coach_payment_requests add column if not exists sessions int not null default 0;

-- Recreate coach_book_session with an option to spend one of the coachee's prepaid coach-credits.
drop function if exists public.coach_book_session(uuid, uuid, date, int, int);
create or replace function public.coach_book_session(
  p_client  uuid,
  p_service uuid,
  p_date    date,
  p_hour    int,
  p_persons int default 1,
  p_use_client_credit boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_gym uuid; v_role user_role; v_mode text; v_price int;
  v_srv services%rowtype; v_open int; v_close int;
  v_start timestamptz; v_end timestamptz; v_id uuid; v_bal int; v_billing text; v_charge int;
  v_cbal int;
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

  -- If spending a coachee credit, make sure they have one with this coach.
  if p_use_client_credit then
    select coalesce(sum(delta), 0) into v_cbal from coach_credit_ledger where coach_id = v_coach and client_id = p_client;
    if v_cbal < 1 then raise exception 'Deze client heeft geen sessietegoed bij jou.' using errcode='P0001'; end if;
  end if;

  -- Room billing (coach ↔ gym) is unchanged.
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
  if p_use_client_credit then
    insert into coach_credit_ledger (gym_id, coach_id, client_id, delta, reason, ref_id) values (v_gym, v_coach, p_client, -1, 'sessie', v_id);
  end if;
  return v_id;
end; $$;
grant execute on function public.coach_book_session(uuid, uuid, date, int, int, boolean) to authenticated;
