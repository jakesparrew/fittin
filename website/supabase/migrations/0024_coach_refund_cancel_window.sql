-- 0024: (a) refund a coach's session-credit when a credit-billed coach booking is cancelled
-- (any cancel path: coach, member, or admin). (b) configurable member cancellation window.

create or replace function public.refund_coach_credit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'geannuleerd' and old.status <> 'geannuleerd'
     and new.coach_billing = 'credit' and new.coach_id is not null then
    -- only refund once (guard against repeat updates)
    if not exists (select 1 from coach_ledger where ref_id = new.id and reason = 'annulatie') then
      insert into coach_ledger (gym_id, coach_id, delta, reason, ref_id)
      values (new.gym_id, new.coach_id, 1, 'annulatie', new.id);
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists refund_coach_credit_after on bookings;
create trigger refund_coach_credit_after after update on bookings
  for each row execute function public.refund_coach_credit();

-- How many hours before the start a member may still cancel (0 = up to start time).
alter table gyms add column if not exists cancel_hours int not null default 1;
