-- 0003: admin / superadmin management — manage bookings, schedule, pricing, members.
-- The 'beheerder' role is the superadmin for the gym (full control). is_staff() = coach|beheerder.

-- ---------------------------------------------------------------------------
-- Slot blocks: make a time unavailable (maintenance, private event, holiday).
-- ---------------------------------------------------------------------------
create table if not exists slot_blocks (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists slot_blocks_gym_idx on slot_blocks(gym_id, starts_at);
alter table slot_blocks enable row level security;

drop policy if exists slot_blocks_select on slot_blocks;
create policy slot_blocks_select on slot_blocks for select using (true);
drop policy if exists slot_blocks_write on slot_blocks;
create policy slot_blocks_write on slot_blocks for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());

-- ---------------------------------------------------------------------------
-- Staff write access (manage on behalf of members)
-- ---------------------------------------------------------------------------
-- Staff can create bookings for any member in their gym.
drop policy if exists bookings_insert on bookings;
create policy bookings_insert on bookings for insert
  with check (
    (user_id = auth.uid() and gym_id = current_gym_id())
    or (gym_id = current_gym_id() and is_staff())
  );

-- Staff can write the credit ledger (grants, refunds, corrections).
drop policy if exists credits_insert_staff on credits_ledger;
create policy credits_insert_staff on credits_ledger for insert
  with check (gym_id = current_gym_id() and is_staff());

-- Staff can insert memberships / punch cards (manual grants).
drop policy if exists memberships_write_staff on memberships;
create policy memberships_write_staff on memberships for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());
drop policy if exists punch_cards_write_staff on punch_cards;
create policy punch_cards_write_staff on punch_cards for all
  using (gym_id = current_gym_id() and is_staff())
  with check (gym_id = current_gym_id() and is_staff());

-- ---------------------------------------------------------------------------
-- Block-aware availability + booking
-- ---------------------------------------------------------------------------
-- Reject any booking that lands inside a blocked window.
create or replace function public.reject_blocked_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'bevestigd' and exists (
    select 1 from slot_blocks sb
    where sb.gym_id = new.gym_id and new.starts_at >= sb.starts_at and new.starts_at < sb.ends_at
  ) then
    raise exception 'Dit tijdslot is geblokkeerd.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reject_blocked on bookings;
create trigger trg_reject_blocked before insert on bookings
  for each row execute function reject_blocked_booking();

-- Availability = confirmed bookings UNION blocked slots.
create or replace function public.gym_taken_slots(p_gym uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.starts_at from bookings b
  where b.gym_id = p_gym and b.status = 'bevestigd'
    and b.starts_at >= p_from and b.starts_at < p_to
  union
  select sb.starts_at from slot_blocks sb
  where sb.gym_id = p_gym and sb.starts_at >= p_from and sb.starts_at < p_to;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs (staff only)
-- ---------------------------------------------------------------------------

-- Block a single hour-slot for the caller's gym.
create or replace function public.admin_block_slot(p_date date, p_hour int, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid; v_slot int; v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  if not is_staff() then raise exception 'Geen rechten.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  select slot_minutes into v_slot from gyms where id = v_gym;
  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => coalesce(v_slot,75));
  insert into slot_blocks (gym_id, starts_at, ends_at, reason, created_by)
  values (v_gym, v_start, v_end, p_reason, auth.uid()) returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.admin_block_slot(date, int, text) to authenticated;

-- Create a booking on behalf of a member (offline/cash → marked paid).
create or replace function public.admin_create_booking(
  p_member uuid, p_service uuid, p_date date, p_hour int, p_persons int default 1
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid; v_srv services%rowtype; v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  if not is_staff() then raise exception 'Geen rechten.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  select * into v_srv from services where id = p_service and gym_id = v_gym;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  v_start := (p_date + make_interval(hours => p_hour)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => v_srv.duration_min);
  begin
    insert into bookings (gym_id, service_id, user_id, starts_at, ends_at, persons, payment_source, price_cents, paid)
    values (v_gym, v_srv.id, p_member, v_start, v_end, p_persons, 'los', v_srv.price_cents, true)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;
  return v_id;
end; $$;
grant execute on function public.admin_create_booking(uuid, uuid, date, int, int) to authenticated;

-- Adjust a member's credit balance (grant/deduct/refund).
create or replace function public.admin_adjust_credits(p_member uuid, p_delta int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_gym uuid;
begin
  if not is_staff() then raise exception 'Geen rechten.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  if not exists (select 1 from profiles where id = p_member and gym_id = v_gym) then
    raise exception 'Lid niet gevonden.' using errcode='P0001';
  end if;
  insert into credits_ledger (gym_id, user_id, delta, reason)
  values (v_gym, p_member, p_delta, coalesce(p_reason, 'correctie'));
end; $$;
grant execute on function public.admin_adjust_credits(uuid, int, text) to authenticated;

-- Change a member's role (lid/coach/beheerder) within the gym.
create or replace function public.admin_set_role(p_member uuid, p_role user_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_gym uuid;
begin
  if (select role from profiles where id = auth.uid()) <> 'beheerder' then
    raise exception 'Alleen beheerder.' using errcode='P0001';
  end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  update profiles set role = p_role where id = p_member and gym_id = v_gym;
end; $$;
grant execute on function public.admin_set_role(uuid, user_role) to authenticated;
