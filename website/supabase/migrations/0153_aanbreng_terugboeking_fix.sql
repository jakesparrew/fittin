-- 0153 — Fix in de terugboeking van 0152: `max(cl.referral_id)` bestaat niet.
--
-- Postgres heeft geen max()-aggregaat voor uuid. De aanrekening werkte daardoor wél, maar het
-- TERUGDRAAIEN bij een annulering brak met "function max(uuid) does not exist" — en omdat die
-- fout in een trigger zit, mislukte de hele annulering. Gevonden door de rollback-test vóór er
-- ooit een echte doorgave bestond; er is dus geen data mee besmet.
--
-- array_agg werkt wél op uuid. Er hoort per boeking maar één aanbreng-regel te staan; de sortering
-- maakt de keuze deterministisch mocht een handmatige correctie er ooit twee maken.
create or replace function public.charge_referral_fee()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_net   numeric;
  v_ref   record;
  v_fee   numeric;
  v_used  int;
  v_klopt boolean;
begin
  select coalesce(sum(delta), 0) into v_net
    from coach_ledger where ref_id = new.id and reason in ('aanbreng', 'aanbreng_terug');

  -- Wie hoort er bij deze boeking te betalen? Geen rij = niemand.
  select r.* into v_ref
    from gym_referrals r
   where r.gym_id = new.gym_id
     and r.coach_id = new.coach_id
     and r.client_id = new.user_id
     and r.status = 'aanvaard'
     and r.ended_at is null
     and new.starts_at >= r.referred_at
     and (r.months_cap is null or new.starts_at < coalesce(r.accepted_at, r.referred_at) + make_interval(months => r.months_cap))
   order by r.referred_at
   limit 1;

  v_klopt := new.status = 'bevestigd'
         and new.coach_id is not null
         and new.user_id is not null
         and new.user_id <> new.coach_id
         and new.coach_billing = 'credit'
         and v_ref.id is not null;

  -- Terugdraaien: geannuleerd, of de boeking wijst niet langer naar een aangebrachte klant
  -- (client vervangen, coach gewisseld, doorgave beeindigd).
  if v_net < 0 and not v_klopt then
    insert into coach_ledger (gym_id, coach_id, delta, reason, ref_id, referral_id)
    select cl.gym_id, cl.coach_id, -v_net, 'aanbreng_terug', new.id,
           (array_agg(cl.referral_id order by cl.created_at desc))[1]
      from coach_ledger cl where cl.ref_id = new.id and cl.reason = 'aanbreng'
     group by cl.gym_id, cl.coach_id;
    return new;
  end if;

  if not v_klopt or v_net <> 0 then return new; end if;

  -- Plafond in sessies: tel de boekingen die netto betaald gebleven zijn.
  if v_ref.sessions_cap is not null then
    select count(*) into v_used from (
      select cl.ref_id from coach_ledger cl
       where cl.referral_id = v_ref.id and cl.reason in ('aanbreng', 'aanbreng_terug')
       group by cl.ref_id having sum(cl.delta) < 0) t;
    if v_used >= v_ref.sessions_cap then return new; end if;
  end if;

  -- Per BOEKING, niet per uur (owner-beslissing). 6 euro = 0,5 beurt van 12 euro.
  v_fee := round(v_ref.fee_cents / 1200.0, 2);
  if v_fee <= 0 then return new; end if;
  insert into coach_ledger (gym_id, coach_id, delta, reason, ref_id, referral_id)
  values (new.gym_id, new.coach_id, -v_fee, 'aanbreng', new.id, v_ref.id);
  return new;
end; $$;
