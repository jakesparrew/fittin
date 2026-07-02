-- 0103_client_errors.sql
-- First-party error monitoring (no external SDK — keeps the "geen externe tracker" posture). Client
-- JS errors + the global error boundary POST to /api/log-error, which inserts here via service-role.
-- Surfaced in the superadmin health strip (Batch 6). Self-capping via a retention index.
create table if not exists client_errors (
  id         bigint generated always as identity primary key,
  message    text not null,
  stack      text,
  path       text,
  ua         text,
  user_id    uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table client_errors enable row level security;   -- no policies → service-role only
revoke all on client_errors from anon, authenticated;
create index if not exists client_errors_created on client_errors (created_at desc);
