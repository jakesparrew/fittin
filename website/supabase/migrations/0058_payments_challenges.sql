-- 0058: payment-flow correctness + challenge rewards (audit juni 2026)
--   • Persist the agreed charge + applied discount on the booking, so resuming an abandoned
--     checkout re-charges the SAME discounted amount (was: full price). Redemption is recorded
--     by the webhook only after payment succeeds (so abandoning no longer burns a one-time code).
--   • Sequential, gap-free invoice numbers (Belgian VAT requirement) via gyms.invoice_seq.
--   • Challenge reward credits are actually granted to members who reach the goal.

-- ── booking: remember the discounted charge + code ──────────────────────────────────
alter table bookings add column if not exists charge_cents int;
alter table bookings add column if not exists discount_code_id uuid references discount_codes(id) on delete set null;

-- ── sequential invoice numbers ──────────────────────────────────────────────────────
alter table gyms     add column if not exists invoice_seq int not null default 0;
alter table payments add column if not exists invoice_no text;

-- Assign (once) and return a sequential invoice number for a member payment. Beheerder only.
create or replace function public.assign_invoice_no(p_payment uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_gym uuid; v_existing text; v_seq int; v_no text;
begin
  if not is_beheerder() then raise exception 'Alleen beheerder.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  select invoice_no into v_existing from payments where id = p_payment and gym_id = v_gym;
  if v_existing is not null then return v_existing; end if;
  if not exists (select 1 from payments where id = p_payment and gym_id = v_gym) then
    raise exception 'Betaling niet gevonden.' using errcode='P0001';
  end if;
  update gyms set invoice_seq = invoice_seq + 1 where id = v_gym returning invoice_seq into v_seq;
  v_no := to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');
  update payments set invoice_no = v_no where id = p_payment;
  return v_no;
end; $$;
grant execute on function public.assign_invoice_no(uuid) to authenticated;

-- ── challenge rewards: grant credits to members who reached the goal ─────────────────
-- Idempotent (one 'challenge' credit row per member per challenge). Processes recently-ended
-- and active session-count challenges. Called from the daily cron.
create or replace function public.award_challenges()
returns int language plpgsql security definer set search_path = public as $$
declare c record; v_total int := 0; v_n int;
begin
  for c in
    select * from challenges
    where reward_credits > 0 and goal_type = 'sessions'
      and starts_on is not null and ends_on is not null
      and ends_on >= (now() - interval '7 days')::date
  loop
    with reached as (
      select b.user_id
      from bookings b
      where b.gym_id = c.gym_id and b.status = 'bevestigd'
        and b.starts_at::date >= c.starts_on and b.starts_at::date <= c.ends_on
      group by b.user_id
      having count(*) >= c.goal_count
    ), granted as (
      insert into credits_ledger (gym_id, user_id, delta, reason, ref_id)
      select c.gym_id, r.user_id, c.reward_credits, 'challenge', c.id
      from reached r
      where not exists (
        select 1 from credits_ledger cl
        where cl.user_id = r.user_id and cl.reason = 'challenge' and cl.ref_id = c.id
      )
      returning 1
    )
    select count(*) into v_n from granted;
    v_total := v_total + coalesce(v_n, 0);
  end loop;
  return v_total;
end; $$;
grant execute on function public.award_challenges() to service_role;
