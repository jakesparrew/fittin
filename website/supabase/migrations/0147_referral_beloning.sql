-- 0147: de aanbrengbeloning weer laten uitbetalen.
--
-- Wat er misging. Migratie 0021 gaf de aanbrenger +1 sessietegoed, met een rem van 10 beloonde
-- aanbrengsten per 30 dagen. Migratie 0057 heeft die uitkering eruit gehaald en verving ze door
-- "een klassementspunt" — op een ranglijst van 83 mensen. Ondertussen belooft het coachdashboard
-- én stap 3 van de onboardingreeks nog altijd een gratis sessie. Resultaat: 0 referrals ooit.
--
-- Deze migratie doet drie dingen:
--   1. reward_pending_referral keert weer uit (+1 tegoed, reden 'aanbreng', met de rem uit 0021).
--   2. redeem_referral geeft de vriend zijn extra tegoed alleen nog als hij zijn welkomuur al op
--      heeft. Anders krijgt de vriend twee gratis uren en de aanbrenger nul — precies de
--      scheefheid die we rechtzetten. Netto geven we geen euro méér weg dan vandaag.
--   3. Een leesbare hulpfunctie die de sweep gebruikt om te vinden wie er recht heeft.
--
-- Wat deze migratie NIET doet: ze raakt create_booking, de boekweg en de betaalweg niet aan.

-- ── 1. De uitkering ────────────────────────────────────────────────────────────────────────
create or replace function public.reward_pending_referral(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_gym uuid; v_referrer uuid; v_recent int;
begin
  select id, gym_id, referrer_id into v_id, v_gym, v_referrer
    from referrals where referred_id = p_user and status = 'pending' limit 1;
  -- Idempotent: alleen een rij die nog op 'pending' staat wordt beloond. De twee bestaande
  -- aanroepen vanuit de Stripe-webhook en de nieuwe dagelijkse sweep kunnen elkaar dus niet
  -- dubbel uitbetalen, in welke volgorde ze ook vuren.
  if v_id is null then return; end if;
  update referrals set status = 'rewarded', rewarded_at = now() where id = v_id;

  -- Rem uit 0021: hoogstens 10 beloonde aanbrengsten per 30 dagen. Telt ná de update hierboven,
  -- dus de zojuist beloonde rij telt mee — vandaar <= 10 en niet < 10.
  select count(*) into v_recent from referrals
    where referrer_id = v_referrer and status = 'rewarded' and rewarded_at > now() - interval '30 days';
  if v_recent <= 10 then
    -- reden 'aanbreng' i.p.v. 'referral': in het grootboek moet je kunnen zien of een tegoed naar
    -- de nieuwkomer ging (referral) of naar wie hem meebracht (aanbreng). Zonder dat onderscheid
    -- is achteraf niet uit te rekenen wat het programma kost.
    insert into credits_ledger (gym_id, user_id, delta, reason, ref_id)
    values (v_gym, v_referrer, 1, 'aanbreng', v_id);

    insert into notifications (gym_id, user_id, type, title, body, link)
    values (v_gym, v_referrer, 'system', 'Je vriend trainde — je krijgt een sessie 🎉',
            'Bedankt om iemand mee te brengen. Er staat een gratis sessie op je naam.', '/account');
  end if;
end; $$;

-- ── 2. De vriend krijgt niet twee keer gratis ──────────────────────────────────────────────
create or replace function public.redeem_referral(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_gym uuid; v_referrer uuid; v_created timestamptz; v_welcome text;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id, created_at, welcome_status into v_gym, v_created, v_welcome from profiles where id = v_uid;
  if exists (select 1 from referrals where referred_id = v_uid) then
    raise exception 'Je hebt al een code gebruikt.' using errcode='P0001';
  end if;
  if exists (select 1 from bookings where user_id = v_uid) then
    raise exception 'Een vriendcode geldt enkel voor nieuwe leden die nog niet boekten.' using errcode='P0001';
  end if;
  if v_created < now() - interval '21 days' then
    raise exception 'Vriendcodes zijn enkel geldig in je eerste weken bij Fittin''.' using errcode='P0001';
  end if;
  select id into v_referrer from profiles where upper(referral_code) = upper(p_code) and gym_id = v_gym;
  if v_referrer is null then raise exception 'Onbekende code.' using errcode='P0001'; end if;
  if v_referrer = v_uid then raise exception 'Je eigen code telt niet.' using errcode='P0001'; end if;

  insert into referrals (gym_id, referrer_id, referred_id, status)
  values (v_gym, v_referrer, v_uid, 'pending');

  -- Heeft hij zijn welkomuur nog staan, dan ís dat zijn gratis sessie en komt er niets bovenop.
  -- Alleen wie dat uur al gebruikt heeft (of er nooit recht op had) krijgt hier een tegoed, zodat
  -- een vriendcode nooit met lege handen eindigt.
  if coalesce(v_welcome, '') <> 'eligible' then
    insert into credits_ledger (gym_id, user_id, delta, reason) values (v_gym, v_uid, 1, 'referral');
  end if;
  return 'ok';
end; $$;

-- ── 3. Wie heeft er recht, maar kreeg nog niets? ───────────────────────────────────────────
-- De uitkering hing tot nu volledig aan de Stripe-webhook. Maar de eerste sessies van een
-- aangebracht lid zijn per constructie gratis (welkomuur, of een tegoed), en gratis boekingen
-- worden inline bevestigd zonder Stripe — dus zonder webhook. De beloning hing precies op het pad
-- waar een vers lid nooit langskomt. Deze functie levert de achterstand aan de dagelijkse sweep.
create or replace function public.due_referrals()
returns setof uuid language sql security definer set search_path = public as $$
  select r.referred_id
  from referrals r
  where r.status = 'pending'
    and exists (
      select 1 from bookings b
      where b.user_id = r.referred_id
        and b.status = 'bevestigd'
        and b.ends_at <= now()      -- pas ná de sessie: een boeking kan afgezegd of niet nagekomen worden
    );
$$;

-- Per rol intrekken en toekennen. `revoke ... from public` haalt de standaardgrants van Supabase
-- op anon/authenticated NIET weg — die moeten per rol, anders staat de functie alsnog open.
revoke execute on function public.due_referrals() from public, anon, authenticated;
grant execute on function public.due_referrals() to service_role;

revoke execute on function public.reward_pending_referral(uuid) from public, anon;
grant execute on function public.reward_pending_referral(uuid) to authenticated, service_role;

revoke execute on function public.redeem_referral(text) from public, anon;
grant execute on function public.redeem_referral(text) to authenticated;
