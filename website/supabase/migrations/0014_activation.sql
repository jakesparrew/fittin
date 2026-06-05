-- 0014: activation ("motivatie") campaigns — behaviour-triggered emails that win members back
-- and keep them booking. Reuses campaigns/campaign_sends; kind = 'activation', evaluated daily.

alter table campaigns add column if not exists trigger_type text;          -- inactive | never_booked | momentum | low_credits | lapsed_member
alter table campaigns add column if not exists trigger_params jsonb not null default '{}'::jsonb; -- e.g. {"days":10}
alter table campaigns add column if not exists cooldown_days int not null default 30;  -- don't re-hit the same member within N days
alter table campaigns add column if not exists reward_credits int not null default 0;  -- optional: grant N free sessions when sent
alter table campaigns add column if not exists last_run_at timestamptz;

-- A reusable view of each member's engagement signals (per gym). Used by the segment engine.
create or replace view member_engagement as
select
  p.id            as user_id,
  p.gym_id,
  p.full_name,
  p.email,
  (select max(b.starts_at) from bookings b
     where b.user_id = p.id and b.status = 'bevestigd' and b.starts_at <= now()) as last_visit,
  (select count(*) from bookings b
     where b.user_id = p.id and b.status = 'bevestigd'
       and b.starts_at >= date_trunc('month', now()) and b.starts_at <= now())   as visits_this_month,
  (select count(*) from bookings b
     where b.user_id = p.id and b.status = 'bevestigd' and b.starts_at <= now())  as visits_total,
  coalesce((select sum(cl.delta) from credits_ledger cl where cl.user_id = p.id), 0) as credits,
  (select count(*) from memberships m
     where m.user_id = p.id and m.status = 'actief')                              as active_memberships,
  (select count(*) from memberships m where m.user_id = p.id)                     as ever_memberships
from profiles p
where p.role = 'lid';
