-- 0017: buddies (members connect + bring each other to sessions; a buddy's attendance counts
-- as a visit for their own stats/streaks/activation).

create table if not exists buddies (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status       text not null default 'pending',  -- pending | accepted
  created_at   timestamptz not null default now(),
  unique (gym_id, requester_id, addressee_id)
);
create index if not exists buddies_addressee_idx on buddies(addressee_id, status);
alter table buddies enable row level security;

drop policy if exists buddies_select on buddies;
create policy buddies_select on buddies for select
  using (gym_id = current_gym_id() and (requester_id = auth.uid() or addressee_id = auth.uid() or is_staff()));
drop policy if exists buddies_insert on buddies;
create policy buddies_insert on buddies for insert
  with check (gym_id = current_gym_id() and requester_id = auth.uid() and addressee_id <> auth.uid());
drop policy if exists buddies_update on buddies;
create policy buddies_update on buddies for update
  using (gym_id = current_gym_id() and addressee_id = auth.uid());   -- accept/decline
drop policy if exists buddies_delete on buddies;
create policy buddies_delete on buddies for delete
  using (gym_id = current_gym_id() and (requester_id = auth.uid() or addressee_id = auth.uid()));

-- Buddies who join a booking (besides the booker). Each gets a visit counted.
create table if not exists booking_participants (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (booking_id, user_id)
);
create index if not exists booking_participants_user_idx on booking_participants(user_id);
alter table booking_participants enable row level security;
drop policy if exists booking_participants_select on booking_participants;
create policy booking_participants_select on booking_participants for select
  using (gym_id = current_gym_id() and (user_id = auth.uid() or is_staff()
    or exists (select 1 from bookings b where b.id = booking_id and b.user_id = auth.uid())));

-- Add accepted buddies to one of your own bookings (definer; validates ownership + friendship).
create or replace function public.add_booking_buddies(p_booking uuid, p_buddies uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_gym uuid; v_owner uuid; b uuid; n int := 0;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id, user_id into v_gym, v_owner from bookings where id = p_booking;
  if v_owner is null or v_owner <> v_uid then raise exception 'Geen eigen boeking.' using errcode='P0001'; end if;
  foreach b in array coalesce(p_buddies, '{}') loop
    if exists (
      select 1 from buddies f where f.gym_id = v_gym and f.status = 'accepted'
        and ((f.requester_id = v_uid and f.addressee_id = b) or (f.addressee_id = v_uid and f.requester_id = b))
    ) then
      insert into booking_participants (gym_id, booking_id, user_id) values (v_gym, p_booking, b)
      on conflict (booking_id, user_id) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end; $$;
grant execute on function public.add_booking_buddies(uuid, uuid[]) to authenticated;

-- Engagement now counts attendance as booker OR as a joined buddy.
create or replace view member_engagement as
with attendance as (
  select b.user_id, b.starts_at from bookings b where b.status = 'bevestigd'
  union all
  select bp.user_id, b.starts_at from booking_participants bp
    join bookings b on b.id = bp.booking_id where b.status = 'bevestigd'
)
select
  p.id as user_id, p.gym_id, p.full_name, p.email,
  (select max(a.starts_at) from attendance a where a.user_id = p.id and a.starts_at <= now()) as last_visit,
  (select count(*) from attendance a where a.user_id = p.id and a.starts_at >= date_trunc('month', now()) and a.starts_at <= now()) as visits_this_month,
  (select count(*) from attendance a where a.user_id = p.id and a.starts_at <= now()) as visits_total,
  coalesce((select sum(cl.delta) from credits_ledger cl where cl.user_id = p.id), 0) as credits,
  (select count(*) from memberships m where m.user_id = p.id and m.status = 'actief') as active_memberships,
  (select count(*) from memberships m where m.user_id = p.id) as ever_memberships
from profiles p
where p.role = 'lid';
