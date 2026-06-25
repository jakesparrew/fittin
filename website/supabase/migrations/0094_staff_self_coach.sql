-- 0094_staff_self_coach.sql
-- ROOT-CAUSE FIX for "coach can't find his session".
--
-- Symptom: a session booked with a coach/beheerder as the MEMBER (bookings.user_id) but no coach
-- attached (coach_id=null) never shows in that coach's agenda/dashboard, because those views filter
-- strictly on coach_id. This happens when the superadmin books "for" a coach via admin_create_booking
-- without also picking that coach in the optional coach field (easy to forget). It already bit Jelle
-- (one-off data patch) and is now back for TDW + Thomas — so we fix the cause, not just the data.
--
-- Fix: a BEFORE INSERT trigger. When a booking is inserted with no coach_id, the booker is staff
-- (coach/beheerder), AND it was created BY SOMEONE ELSE (auth.uid() <> user_id, i.e. an admin booking
-- on behalf of the coach), treat it as that coach's own reserved slot → coach_id := user_id. It then
-- shows in their agenda as "Gereserveerd · nog geen client" and they can assign a client or cancel it.
--
-- The `auth.uid() <> user_id` guard is the important part: it deliberately does NOT fire when a staff
-- member books their OWN gym time via /boeken (create_booking, where auth.uid() = user_id). Without
-- that guard, a coach's genuine personal gym session would become an assignable "reserved" slot that
-- coachAssignClient could overwrite — corrupting a session they paid for. coach_book_session already
-- sets coach_id non-null, so the `coach_id is null` guard skips it. Regular members are never staff.

create or replace function public.bookings_staff_self_coach()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coach_id is null
     and auth.uid() is not null
     and auth.uid() <> new.user_id              -- booked on behalf of the coach by an admin, not self-booked
     and exists (
       select 1 from profiles p
       where p.id = new.user_id
         and p.gym_id = new.gym_id              -- multi-tenant scope guard
         and p.role in ('coach', 'beheerder')
     ) then
    new.coach_id := new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_staff_self_coach on bookings;
create trigger trg_bookings_staff_self_coach
  before insert on bookings
  for each row
  execute function public.bookings_staff_self_coach();
