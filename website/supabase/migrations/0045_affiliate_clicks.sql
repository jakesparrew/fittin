-- 0045: log outbound affiliate clicks (our own analytics; inserts via service role).
create table if not exists affiliate_clicks (
  id         uuid primary key default gen_random_uuid(),
  merchant   text not null default 'bodyfit',
  product    text,
  dest       text,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_clicks_idx on affiliate_clicks(merchant, created_at desc);
alter table affiliate_clicks enable row level security;
drop policy if exists affiliate_clicks_select on affiliate_clicks;
create policy affiliate_clicks_select on affiliate_clicks for select using (is_staff());
