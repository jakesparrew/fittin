-- 0019: in-app inbox — store inbound emails to *@fittin.be (received via Resend Inbound) so the
-- superadmin can read + reply from the admin panel.
create table if not exists inbound_emails (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid references gyms(id) on delete cascade,
  resend_id   text unique,
  from_email  text,
  from_name   text,
  to_email    text,           -- the @fittin.be address it was sent to (reply goes from here)
  subject     text,
  text_body   text,
  html_body   text,
  message_id  text,
  in_reply_to text,
  received_at timestamptz,
  read        boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists inbound_emails_idx on inbound_emails(gym_id, received_at desc);
alter table inbound_emails enable row level security;
drop policy if exists inbound_emails_staff on inbound_emails;
create policy inbound_emails_staff on inbound_emails for all
  using (gym_id = current_gym_id() and (select role from profiles where id = auth.uid()) = 'beheerder')
  with check (gym_id = current_gym_id() and (select role from profiles where id = auth.uid()) = 'beheerder');
