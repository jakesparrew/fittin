-- 0171 — Rustig uur enkel op een VOL uur (eigenaar 2026-09-19: "het gratis 2e uur mag nooit een uur van een druk
-- moment afnemen").
--
-- slot_promo keek naar het startuur en het uur erna. Een boeking van 2 uur vanaf 10:30 loopt tot 12:30 en bijt zo een
-- half uur uit 12:00 — dat niet gekeurd werd en druk kan zijn. Nu: een startmoment op het halfuur is nooit rustig,
-- dus het gratis uur valt altijd precies in het tweede (ook rustige) uur. Zelfde regel in de client (BookingClient).
create or replace function public.slot_promo(p_gym uuid, p_start timestamptz)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  with u as (
    select h, d.klasse, d.pin
    from (values (0), (1)) as t(h)
    left join public.slot_demand d
      on d.gym_id = p_gym
     and d.dow  = extract(isodow from ((p_start + make_interval(hours => t.h)) at time zone 'Europe/Brussels'))::int
     and d.hour = extract(hour   from ((p_start + make_interval(hours => t.h)) at time zone 'Europe/Brussels'))::int
  )
  select case
    when not coalesce((select rustig_aan from public.gamification_settings where gym_id = p_gym), true) then null
    when p_start <= now() then null
    when extract(minute from (p_start at time zone 'Europe/Brussels')) <> 0 then null
    -- beide uren (het startuur en het uur erna) moeten rustig of vastgepind zijn, en geen van beide op 'nooit'
    when exists (select 1 from u where pin = 'nooit') then null
    when (select count(*) from u where pin = 'altijd' or klasse = 'rustig') = 2 then 'rustig'
    else null
  end
$$;
revoke all on function public.slot_promo(uuid, timestamptz) from public;
revoke all on function public.slot_promo(uuid, timestamptz) from anon;
revoke all on function public.slot_promo(uuid, timestamptz) from authenticated;
grant execute on function public.slot_promo(uuid, timestamptz) to service_role;
