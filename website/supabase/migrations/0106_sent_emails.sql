-- Batch 6.2 — transactional email log. (Note: `sent_emails` already exists since 0030 for inbox
-- compose/replies — a different concern, so we use a dedicated `email_log` table here.)
-- lib/email.js persists nothing today, so the owner can't answer "did my mail go out?". This records
-- every transactional send + its delivery status. Written fire-and-forget via the service role;
-- read-only for the beheerder in the cockpit.

create table if not exists email_log (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid references gyms(id) on delete set null,
  to_email    text,
  to_user_id  uuid references profiles(id) on delete set null,
  kind        text,                          -- e.g. booking_confirmation, access_code, welcome …
  subject     text,
  status      text not null default 'sent',  -- sent | delivered | opened | bounced | failed
  resend_id   text,                          -- Resend message id → matched by the resend webhook
  error       text,                          -- populated when the send was rejected
  created_at  timestamptz not null default now()
);

create index if not exists email_log_created_idx on email_log(created_at desc);
create index if not exists email_log_to_email_idx on email_log(lower(to_email), created_at desc);
create index if not exists email_log_resend_idx on email_log(resend_id);

alter table email_log enable row level security;
-- Cockpit data — only the beheerder reads it. Inserts/updates run via the service role (bypass RLS).
create policy email_log_read on email_log for select using (is_beheerder());
