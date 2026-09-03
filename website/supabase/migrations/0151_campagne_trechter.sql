-- 0151: de campagnetrechter per ADVERTENTIE — bezoekers → aanmeldingen → boekingen.
--
-- WAAROM: pv_campaigns (0137) koppelt betaald verkeer al aan "toonde interesse", maar met één
-- samengevoegde kolom (slot gekozen OF checkout gestart OF geboekt) en zonder utm_content. Voor de
-- Meta-campagne die nu draait is dat te grof: je wil weten wélke advertentie boekingen bracht, en
-- je wil aanmeldingen los van boekingen zien — dat zijn twee verschillende stappen, en de
-- Google-aanmeldingen werden pas sinds kort geteld (signup_completed vuurde niet op de Google-weg).
--
-- HOE DE ATTRIBUTIE WERKT (zelfde principe als 0137, geen cookie, geen pixel): de bezoeker-hash in
-- page_views is sha256(ip|ua|DAG|geheim) — hij bestaat dus maar binnen één kalenderdag. Een
-- landing met een utm-label en een conversie op dezelfde dag delen die hash; de join `c.v = l.v and
-- c.d = l.d` koppelt ze. De bekende grens is dat een klik op maandag en een boeking op woensdag
-- niet meer matchen (andere dag = andere hash). Dit is dus een ONDERGRENS, geen volledige waarheid
-- — precies wat je zonder pixel kan meten.

-- utm_content bestond nog niet op page_views: /api/pv bewaarde enkel source/medium/campaign. Zonder
-- deze kolom kan je niet zien wélke advertentie werkte, alleen wélke campagne. De beacon vult ze
-- vanaf nu (lib/track.js + app/api/pv/route.js); oude rijen blijven NULL en tellen als '(geen)'.
alter table public.page_views add column if not exists utm_content text;

create or replace function public.pv_campaign_funnel(p_from timestamptz, p_to timestamptz, p_limit int default 40)
returns table (utm_source text, utm_campaign text, utm_content text, visitors bigint, signups bigint, bookings bigint)
language sql stable security definer set search_path = public as $$
  with landing as (
    select coalesce(pv.utm_source, '(geen)')  as s,
           coalesce(pv.utm_campaign, '')       as c,
           coalesce(pv.utm_content, '')         as ct,
           pv.visitor                           as v,
           (pv.created_at at time zone 'Europe/Brussels')::date as d
    from page_views pv
    where pv.created_at >= p_from and pv.created_at < p_to and pv.utm_source is not null
  ),
  -- Distinct per bezoeker/dag/event: een lid dat drie keer op "boek" tikt is één boeking.
  conv as (
    select distinct pv.visitor as v,
           (pv.created_at at time zone 'Europe/Brussels')::date as d,
           pv.event as e
    from page_views pv
    where pv.created_at >= p_from and pv.created_at < p_to
      and pv.event in ('signup_completed', 'booking_completed')
  )
  select l.s, l.c, l.ct,
         count(distinct l.v)::bigint,
         count(distinct l.v) filter (where c.e = 'signup_completed')::bigint,
         count(distinct l.v) filter (where c.e = 'booking_completed')::bigint
  from landing l
  left join conv c on c.v = l.v and c.d = l.d
  group by 1, 2, 3
  order by 4 desc
  limit p_limit;
$$;

-- Supabase deelt EXECUTE automatisch uit aan anon én authenticated op elke nieuwe functie (zie de
-- waarschuwing in 0142). Deze functie is security definer bovenop page_views, dus expliciet
-- intrekken per rol — alleen de service-role (de beheerpagina's) mag haar aanroepen.
revoke all on function public.pv_campaign_funnel(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.pv_campaign_funnel(timestamptz, timestamptz, int) to service_role;
