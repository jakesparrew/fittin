-- 0137_meten.sql
-- Meetlaag rechtzetten (groei-audit G5-2 + G5-7). Geen datamigratie: enkel leesfuncties worden
-- vervangen, de tabel page_views blijft ongewijzigd. NIET automatisch toegepast — de eigenaar
-- draait dit bestand zelf tegen de productiedatabank.
--
-- WAAROM (G5-2): sinds 0101 schrijft dezelfde tabel twee soorten rijen weg — echte paginaweergaves
-- (event is null) én benoemde trechter-events (event is not null). De aggregaties uit 0082 tellen
-- alles samen. Gevolg: booking_slot_chosen vuurt bij élke slottik, dus /boeken staat kunstmatig
-- bovenaan de populairste pagina's, "weergaves per bezoeker" is opgeblazen en het echte verkeer
-- naar /degym, /personal-training en /lidmaatschap verdwijnt eronder. Eén where-clausule per
-- functie zet dat recht; de trechtercijfers komen uit pv_events/pv_path_visitors, die al filteren.

create or replace function public.pv_summary(p_from timestamptz, p_to timestamptz)
returns table (views bigint, visitors bigint, mobile bigint, desktop bigint)
language sql stable security definer set search_path = public as $$
  select count(*)::bigint,
         count(distinct visitor)::bigint,
         count(*) filter (where device = 'mobile')::bigint,
         count(*) filter (where device = 'desktop')::bigint
  from page_views where created_at >= p_from and created_at < p_to and event is null;
$$;

create or replace function public.pv_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, views bigint, visitors bigint)
language sql stable security definer set search_path = public as $$
  select (created_at at time zone 'Europe/Brussels')::date as day,
         count(*)::bigint, count(distinct visitor)::bigint
  from page_views where created_at >= p_from and created_at < p_to and event is null
  group by 1 order by 1;
$$;

create or replace function public.pv_top_paths(p_from timestamptz, p_to timestamptz, p_limit int default 15)
returns table (path text, views bigint, visitors bigint)
language sql stable security definer set search_path = public as $$
  select path, count(*)::bigint, count(distinct visitor)::bigint
  from page_views where created_at >= p_from and created_at < p_to and event is null
  group by path order by 2 desc limit p_limit;
$$;

create or replace function public.pv_top_referrers(p_from timestamptz, p_to timestamptz, p_limit int default 12)
returns table (referrer_host text, views bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(referrer_host, ''), '(direct)'), count(*)::bigint
  from page_views where created_at >= p_from and created_at < p_to and event is null
  group by 1 order by 2 desc limit p_limit;
$$;

-- WAAROM (G5-7): een campagne zonder intentiecijfer vertelt alleen hoeveel volk er binnenkwam,
-- niet of dat volk iets deed. De UTM-labels hangen bewust enkel aan de LANDINGSpagina (lib/track.js
-- legt uit waarom er niets op het toestel bewaard wordt), dus koppelen we op bezoeker + dag:
-- kwam deze bezoeker binnen via bron X op dag D, en koos hij op dag D een moment of startte hij
-- een betaling? Dat is same-day-attributie — een bewuste beperking, want de bezoeker-hash roteert
-- elke dag en die cookieloze keuze blijft. Campagnes langer dan een dag opvolgen zou opslag op het
-- toestel vragen en dus een cookiebanner.
drop function if exists public.pv_campaigns(timestamptz, timestamptz, int);
create or replace function public.pv_campaigns(p_from timestamptz, p_to timestamptz, p_limit int default 20)
returns table (utm_source text, utm_medium text, utm_campaign text, views bigint, visitors bigint, intent bigint)
language sql stable security definer set search_path = public as $$
  with landing as (
    select coalesce(pv.utm_source, '(geen)') as s,
           coalesce(pv.utm_medium, '')       as m,
           coalesce(pv.utm_campaign, '')     as c,
           pv.visitor                        as v,
           (pv.created_at at time zone 'Europe/Brussels')::date as d
    from page_views pv
    where pv.created_at >= p_from and pv.created_at < p_to and pv.utm_source is not null
  ),
  intentie as (
    -- distinct: hoogstens één rij per bezoeker per dag, anders zou de join de views vermenigvuldigen
    select distinct pv.visitor as v, (pv.created_at at time zone 'Europe/Brussels')::date as d
    from page_views pv
    where pv.created_at >= p_from and pv.created_at < p_to
      and pv.event in ('booking_slot_chosen', 'checkout_started', 'booking_completed')
  )
  select l.s, l.m, l.c,
         count(*)::bigint,
         count(distinct l.v)::bigint,
         count(distinct l.v) filter (where i.v is not null)::bigint
  from landing l
  left join intentie i on i.v = l.v and i.d = l.d
  group by 1, 2, 3 order by 5 desc limit p_limit;
$$;

revoke all on function public.pv_campaigns(timestamptz, timestamptz, int) from public;
grant execute on function public.pv_campaigns(timestamptz, timestamptz, int) to service_role;
