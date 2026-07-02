-- Batch 2 (lifecycle automation): idempotency markers for the transactional first-30-days spine.
-- Additive only. These guard the daily cron sweeps so each member gets each touchpoint exactly once.

-- Day-0 welcome (self-signups + Google): flip true once the branded welcome mail is sent.
alter table profiles add column if not exists day0_welcome_sent boolean not null default false;

-- Post-first-session follow-up: flip true once the "hoe was je eerste sessie?" mail is sent.
alter table profiles add column if not exists first_followup_sent boolean not null default false;

-- Guest → member funnel: mark an email_invite row once the day-after "kom zelf trainen" mail is sent,
-- so a guest who trained multiple times only gets one nudge.
alter table email_invites add column if not exists followup_sent boolean not null default false;

-- Backfill: existing members have already been onboarded manually — don't spam them with a Day-0
-- welcome or a "first session" note. Only genuinely new accounts (created from now on) qualify.
update profiles set day0_welcome_sent = true where created_at < now();
update profiles set first_followup_sent = true
  where exists (select 1 from bookings b where b.user_id = profiles.id and b.status = 'bevestigd' and b.starts_at <= now());
