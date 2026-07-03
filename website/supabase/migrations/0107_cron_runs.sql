-- Batch 6.5 — system-health strip. Both cron routes already build result/error data; persist one row
-- per run so the owner sees "access-code cron last ran X min ago" instead of learning the door is
-- down from a locked-out member. Written by the crons (service role); read-only for the beheerder.

create table if not exists cron_runs (
  id         uuid primary key default gen_random_uuid(),
  job        text not null,        -- 'activation' | 'access_codes' | …
  ok         boolean not null default true,
  detail     jsonb,                -- counts / error messages for the run
  created_at timestamptz not null default now()
);

create index if not exists cron_runs_job_idx on cron_runs(job, created_at desc);

alter table cron_runs enable row level security;
create policy cron_runs_read on cron_runs for select using (is_beheerder());
