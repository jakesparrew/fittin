-- 0030: log outbound mail (inbox compose + replies) so staff can see a "Verzonden" view.
create table if not exists sent_emails (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  from_email  text not null,
  to_email    text not null,           -- comma-joined recipients
  subject     text,
  body        text,
  sent_by     uuid references profiles(id) on delete set null,
  reply_to    uuid references inbound_emails(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists sent_emails_gym_idx on sent_emails(gym_id, created_at desc);
alter table sent_emails enable row level security;
drop policy if exists sent_emails_select on sent_emails;
create policy sent_emails_select on sent_emails for select
  using (gym_id = current_gym_id() and is_staff());
-- inserts are service-role (admin client) only.
