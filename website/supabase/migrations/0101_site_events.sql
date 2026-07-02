-- 0101_site_events.sql
-- Extend the first-party, cookieless analytics (0082) with named funnel events + UTM attribution.
-- Same privacy posture: no PII, no cookie, service-role-only. The /api/pv beacon now also accepts
-- {event} (e.g. 'booking_slot_chosen', 'checkout_started', 'signup_completed', 'install_accepted',
-- 'referral_link_shared') and whitelisted utm_* params captured once per landing.

alter table page_views add column if not exists event text;          -- null = plain pageview
alter table page_views add column if not exists utm_source text;
alter table page_views add column if not exists utm_medium text;
alter table page_views add column if not exists utm_campaign text;

create index if not exists page_views_event_created on page_views (event, created_at) where event is not null;
create index if not exists page_views_utm_created on page_views (created_at) where utm_source is not null;

-- ---- Aggregation RPCs (service-role only; SECURITY DEFINER) ----

-- Named-event counts over a window (the funnel middle: slot chosen, checkout started, …).
create or replace function public.pv_events(p_from timestamptz, p_to timestamptz)
returns table (event text, hits bigint, visitors bigint)
language sql stable security definer set search_path = public as $$
  select event, count(*)::bigint, count(distinct visitor)::bigint
  from page_views
  where created_at >= p_from and created_at < p_to and event is not null
  group by event order by 2 desc;
$$;

-- Campaign attribution: which utm_source/medium/campaign produced visitors + booking-intent events.
create or replace function public.pv_campaigns(p_from timestamptz, p_to timestamptz, p_limit int default 20)
returns table (utm_source text, utm_medium text, utm_campaign text, views bigint, visitors bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(utm_source, '(geen)'), coalesce(utm_medium, ''), coalesce(utm_campaign, ''),
         count(*)::bigint, count(distinct visitor)::bigint
  from page_views
  where created_at >= p_from and created_at < p_to and utm_source is not null
  group by 1, 2, 3 order by 5 desc limit p_limit;
$$;

-- Distinct visitors on a given path (funnel top, e.g. '/boeken').
create or replace function public.pv_path_visitors(p_from timestamptz, p_to timestamptz, p_path text)
returns bigint
language sql stable security definer set search_path = public as $$
  select count(distinct visitor)::bigint from page_views
  where created_at >= p_from and created_at < p_to and event is null and path = p_path;
$$;

revoke all on function public.pv_events(timestamptz, timestamptz) from public;
revoke all on function public.pv_campaigns(timestamptz, timestamptz, int) from public;
revoke all on function public.pv_path_visitors(timestamptz, timestamptz, text) from public;
grant execute on function public.pv_events(timestamptz, timestamptz) to service_role;
grant execute on function public.pv_campaigns(timestamptz, timestamptz, int) to service_role;
grant execute on function public.pv_path_visitors(timestamptz, timestamptz, text) to service_role;
