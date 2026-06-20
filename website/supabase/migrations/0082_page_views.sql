-- 0082_page_views.sql
-- First-party, privacy-friendly website analytics. A page view stores only: the path, the external
-- referrer host, a DAILY anonymous visitor hash (sha256 of ip+ua+date+secret — no PII, no cookie,
-- can't be reversed or linked across days), and device class. Written only by the /api/pv route via
-- the service-role client; read only by the superadmin dashboard via the aggregation RPCs below.

create table if not exists page_views (
  id            bigint generated always as identity primary key,
  path          text not null,
  referrer_host text,
  visitor       text,          -- daily anonymous hash (not PII)
  device        text,          -- 'mobile' | 'desktop'
  created_at    timestamptz not null default now()
);
alter table page_views enable row level security;             -- no policies → service-role only
revoke all on page_views from anon, authenticated;
create index if not exists page_views_created on page_views (created_at);
create index if not exists page_views_path_created on page_views (path, created_at);

-- ---- Aggregation RPCs (service-role only; SECURITY DEFINER, day-bucketed in Europe/Brussels) ----
create or replace function public.pv_summary(p_from timestamptz, p_to timestamptz)
returns table (views bigint, visitors bigint, mobile bigint, desktop bigint)
language sql stable security definer set search_path = public as $$
  select count(*)::bigint,
         count(distinct visitor)::bigint,
         count(*) filter (where device = 'mobile')::bigint,
         count(*) filter (where device = 'desktop')::bigint
  from page_views where created_at >= p_from and created_at < p_to;
$$;

create or replace function public.pv_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, views bigint, visitors bigint)
language sql stable security definer set search_path = public as $$
  select (created_at at time zone 'Europe/Brussels')::date as day,
         count(*)::bigint, count(distinct visitor)::bigint
  from page_views where created_at >= p_from and created_at < p_to
  group by 1 order by 1;
$$;

create or replace function public.pv_top_paths(p_from timestamptz, p_to timestamptz, p_limit int default 15)
returns table (path text, views bigint, visitors bigint)
language sql stable security definer set search_path = public as $$
  select path, count(*)::bigint, count(distinct visitor)::bigint
  from page_views where created_at >= p_from and created_at < p_to
  group by path order by 2 desc limit p_limit;
$$;

create or replace function public.pv_top_referrers(p_from timestamptz, p_to timestamptz, p_limit int default 12)
returns table (referrer_host text, views bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(referrer_host, ''), '(direct)'), count(*)::bigint
  from page_views where created_at >= p_from and created_at < p_to
  group by 1 order by 2 desc limit p_limit;
$$;

revoke all on function public.pv_summary(timestamptz, timestamptz) from public;
revoke all on function public.pv_daily(timestamptz, timestamptz) from public;
revoke all on function public.pv_top_paths(timestamptz, timestamptz, int) from public;
revoke all on function public.pv_top_referrers(timestamptz, timestamptz, int) from public;
grant execute on function public.pv_summary(timestamptz, timestamptz) to service_role;
grant execute on function public.pv_daily(timestamptz, timestamptz) to service_role;
grant execute on function public.pv_top_paths(timestamptz, timestamptz, int) to service_role;
grant execute on function public.pv_top_referrers(timestamptz, timestamptz, int) to service_role;
