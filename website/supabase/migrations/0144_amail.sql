-- 0144_amail.sql
-- NIET automatisch toegepast — de eigenaar draait dit bestand zelf tegen productie.
--
-- Waarom: de campagnetellers op `campaigns` (sent/delivered/opened/clicked/bounced) werden
-- bijgehouden met een lezen-+1-schrijven vanuit de Resend-webhook. Bij een nieuwsbrief naar 716
-- mensen komen die webhooks in bulk binnen; twee gelijktijdige events lezen dan dezelfde teller en
-- schrijven allebei hetzelfde nieuwe getal terug. Eén van de twee is weg.
--
-- Gemeten op productie (campagne "Workouts & oefeningen — wat er nieuw is"):
--   rijen in campaign_sends met status 'delivered' : 673
--   campaigns.delivered                            : 364
-- De rijen kloppen wél (673 delivered + 23 sent + 20 bounced = 716 = campaigns.total), dus de
-- waarheid staat in campaign_sends en de teller is enkel een samenvatting.
--
-- Vandaar: geen atomaire increment maar een hertelling. Die is immuun voor verloren updates én
-- zelfherstellend — de eerstvolgende webhook zet 364 vanzelf recht naar 673. Kost één aggregatie
-- per event over een op campaign_id geïndexeerde tabel.
--
-- Geen enkele bestaande rij in campaign_sends wordt aangeraakt.

create or replace function public.recount_campaign(p_campaign uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update campaigns c set
    -- Met succes aan Resend overgedragen. Een rij die intussen doorschoof naar delivered/opened/
    -- clicked/bounced is óók ooit verstuurd, dus die tellen mee; 'failed' en 'skipped' niet.
    sent      = (select count(*) from campaign_sends s where s.campaign_id = c.id
                  and s.status in ('sent', 'delivered', 'opened', 'clicked', 'bounced')),
    -- De status schuift enkel vooruit (delivered → opened → clicked), dus alles vanaf delivered.
    delivered = (select count(*) from campaign_sends s where s.campaign_id = c.id
                  and s.status in ('delivered', 'opened', 'clicked')),
    -- Op de tijdstempel, niet op de status: wie klikte zonder gemeten opening telt hier toch mee.
    opened    = (select count(*) from campaign_sends s where s.campaign_id = c.id and s.opened_at is not null),
    clicked   = (select count(*) from campaign_sends s where s.campaign_id = c.id and s.clicked_at is not null),
    bounced   = (select count(*) from campaign_sends s where s.campaign_id = c.id and s.status = 'bounced')
  where c.id = p_campaign;
$function$;

-- Enkel de service-role (de webhook-route) hertelt. Leden en beheerders lezen de tellers alleen.
revoke all on function public.recount_campaign(uuid) from public, anon, authenticated;
grant execute on function public.recount_campaign(uuid) to service_role;

-- Eenmalig rechtzetten wat de verloren updates hebben scheefgetrokken, zodat de beheerpagina
-- meteen klopt in plaats van pas bij de volgende webhook.
select public.recount_campaign(id) from public.campaigns;
