-- 0166 — Rustige uren strenger (feedback eigenaar 2026-09-19: "bijna elk moment is nu dubbel").
--
-- Na de lancering stond 74 van de 119 uren op rustig, plus ELK vrij uur binnen 24 uur (last-minuteregel). Een
-- promotie die overal geldt, is geen promotie meer en kost enkel omzet. Nu:
--   1. de last-minuteregel valt weg;
--   2. rustig = hoogstens `rustig_max_weken` van 8 weken geboekt (standaard 1 i.p.v. 2);
--   3. én maximaal `max_rustige_uren` per week (standaard 12) — enkel de rustigste, in blokken van 2 uur; de
--      nachtelijke herberekening kiest ze (lib/punten-motor.js);
--   4. een startuur is pas rustig als OOK het uur erna rustig is: het gratis tweede uur mag niet in een druk uur
--      vallen (eigenaar 2026-09-19).

alter table public.gamification_settings add column if not exists max_rustige_uren int not null default 12;
do $$ begin
  alter table public.gamification_settings add constraint gamification_settings_max_rustig_chk check (max_rustige_uren between 0 and 119);
exception when duplicate_object then null; end $$;
alter table public.gamification_settings alter column rustig_max_weken set default 1;
update public.gamification_settings set rustig_max_weken = 1 where rustig_max_weken = 2;

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
