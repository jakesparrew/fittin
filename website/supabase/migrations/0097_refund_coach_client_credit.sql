-- 0097_refund_coach_client_credit.sql
-- FIX (critical): when a coach books a session that is paid from the CLIENT's prepaid coach-credit
-- (coach_book_session with p_use_client_credit), it debits coach_credit_ledger (-1 'sessie', ref_id
-- = booking) but inserts the booking as payment_source='los'. On cancel:
--   • 0057 refund_member_credit fires only for payment_source='credit'  → skips it
--   • 0024 refund_coach_credit refunds the COACH ledger, not the client's coach_credit_ledger
-- so the client silently loses €12–60 of prepaid value. (app/coach/actions.js even carries a comment
-- claiming a trigger handles this — it does not.) Add the missing refund trigger, mirroring 0024.

create or replace function public.refund_coach_client_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_deb record;
begin
  if new.status = 'geannuleerd' and old.status <> 'geannuleerd' then
    -- refund once
    if not exists (select 1 from coach_credit_ledger where ref_id = new.id and reason = 'annulatie') then
      select gym_id, coach_id, client_id, -sum(delta) as amt
        into v_deb
        from coach_credit_ledger
        where ref_id = new.id and reason = 'sessie' and delta < 0
        group by gym_id, coach_id, client_id;
      if v_deb.amt is not null and v_deb.amt > 0 then
        insert into coach_credit_ledger (gym_id, coach_id, client_id, delta, reason, ref_id)
        values (v_deb.gym_id, v_deb.coach_id, v_deb.client_id, v_deb.amt, 'annulatie', new.id);
      end if;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists refund_coach_client_credit_after on bookings;
create trigger refund_coach_client_credit_after after update on bookings
  for each row execute function public.refund_coach_client_credit();
