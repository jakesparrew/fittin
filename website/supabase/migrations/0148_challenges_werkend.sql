-- 0148: challenges laten uitbetalen wat het beheerscherm belooft — mét een rem op wat je weggeeft.
--
-- Wat er misging. Het scherm /beheer/challenges biedt drie doeltypes aan (aantal sessies, sessies
-- in daluren, streak in weken) en zegt dat start- en einddatum optioneel zijn. award_challenges()
-- deed geen van beide: ze keek alleen naar goal_type = 'sessions' en eiste allebei de datums. Kies
-- je een ander type of laat je een datum leeg, dan haalt een lid de challenge en krijgt hij
-- STILZWIJGEND niets. Dat is erger dan geen challenges hebben.
--
-- Derde fout, en de duurste: er werd geteld op GEBOEKTE sessies binnen de periode, ook die in de
-- toekomst. Wie op 1 september drie keer vooruitboekte, had de beloning diezelfde nacht binnen
-- zonder één keer te komen. Nu telt alleen wat effectief voorbij is.
--
-- Nieuw, op vraag van de eigenaar: een plafond per challenge. Zonder dat staat er geen bovengrens
-- op wat een challenge kost.

-- ── Plafond en dalurenvenster ──────────────────────────────────────────────────────────────
alter table challenges add column if not exists max_winners int;        -- null = geen plafond
alter table challenges add column if not exists dal_from   numeric;     -- daluren: vanaf welk uur
alter table challenges add column if not exists dal_to     numeric;     -- daluren: tot welk uur

comment on column challenges.max_winners is
  'Hoogstens zoveel leden krijgen deze beloning; null = ongelimiteerd. Wie eerst is, is eerst.';

-- ── De uitbetaling ─────────────────────────────────────────────────────────────────────────
create or replace function public.award_challenges()
returns int language plpgsql security definer set search_path = public as $$
declare c record; v_total int := 0; v_n int; v_al int; v_ruimte int;
begin
  for c in
    select * from challenges
    where reward_credits > 0
      -- Datums zijn nu écht optioneel, zoals het scherm belooft. Een challenge zonder einddatum
      -- loopt door; een die meer dan 7 dagen geleden eindigde, laten we met rust.
      and (ends_on is null or ends_on >= (now() - interval '7 days')::date)
  loop
    -- Plafond: hoeveel mensen kregen deze beloning al, en hoeveel plaatsen blijven er over?
    select count(*) into v_al from credits_ledger
      where reason = 'challenge' and ref_id = c.id;
    v_ruimte := case when c.max_winners is null then 2147483647 else c.max_winners - v_al end;
    if v_ruimte <= 0 then continue; end if;

    with sessies as (
      -- Alleen sessies die ECHT gebeurd zijn. `ends_at <= now()` en niet starts_at: een sessie
      -- die vandaag nog loopt telt pas mee als ze afgelopen is.
      select b.user_id,
             b.starts_at at time zone 'Europe/Brussels' as lokaal
      from bookings b
      where b.gym_id = c.gym_id
        and b.status = 'bevestigd'
        and b.ends_at <= now()
        and (c.starts_on is null or (b.starts_at at time zone 'Europe/Brussels')::date >= c.starts_on)
        and (c.ends_on   is null or (b.starts_at at time zone 'Europe/Brussels')::date <= c.ends_on)
    ), geteld as (
      select s.user_id, count(*) as n
      from sessies s
      where case
              -- Daluren: alleen sessies die binnen het ingestelde venster starten. Zonder venster
              -- vallen we terug op 06–16u, de uren die vandaag het leegst staan.
              when c.goal_type = 'daluren'
                then extract(hour from s.lokaal) >= coalesce(c.dal_from, 6)
                 and extract(hour from s.lokaal) <  coalesce(c.dal_to, 16)
              else true
            end
      group by s.user_id
    ), bereikt as (
      select g.user_id from geteld g
      where case
              -- Streak telt WEKEN met minstens één sessie, niet losse sessies. Zonder deze tak
              -- betaalde een streak-challenge nooit uit, hoe lang een lid ook volhield.
              when c.goal_type = 'streak' then (
                select count(distinct date_trunc('week', s2.lokaal))
                from sessies s2 where s2.user_id = g.user_id
              ) >= c.goal_count
              else g.n >= c.goal_count
            end
    ), kandidaten as (
      -- Nog niet beloond, en netjes op volgorde zodat het plafond eerlijk verdeeld wordt.
      select b.user_id from bereikt b
      where not exists (
        select 1 from credits_ledger cl
        where cl.user_id = b.user_id and cl.reason = 'challenge' and cl.ref_id = c.id
      )
      order by b.user_id
      limit v_ruimte
    ), granted as (
      insert into credits_ledger (gym_id, user_id, delta, reason, ref_id)
      select c.gym_id, k.user_id, c.reward_credits, 'challenge', c.id from kandidaten k
      returning user_id
    ), gemeld as (
      -- Een beloning die niemand opmerkt, motiveert niemand. Vandaag kreeg een lid het tegoed
      -- zonder enig bericht: het verscheen gewoon in zijn saldo.
      insert into notifications (gym_id, user_id, type, title, body, link)
      select c.gym_id, g.user_id, 'system', 'Challenge gehaald 🏅',
             c.name || ' — er staat ' || c.reward_credits || ' gratis sessie' ||
             case when c.reward_credits = 1 then '' else 's' end || ' op je naam.',
             '/community'
      from granted g
      returning 1
    )
    select count(*) into v_n from gemeld;
    v_total := v_total + coalesce(v_n, 0);
  end loop;
  return v_total;
end; $$;

revoke execute on function public.award_challenges() from public, anon, authenticated;
grant execute on function public.award_challenges() to service_role;
