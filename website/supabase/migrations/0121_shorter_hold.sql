-- 0121 — Kortere betaalreservering + rem op slot-hamsteren.
--
-- PROBLEEM (owner): een onbetaalde boeking hield het uur 35 minuten bezet. Wie een checkout
-- afbreekt, blokkeert dus meer dan een half uur voor iedereen — en wie er tien na elkaar start,
-- legt een hele avond plat. In een zaal met één ruimte is dat een reëel risico.
--
-- FIX:
--  1) Reservering 35 → 15 minuten. Een Stripe-checkout duurt in de praktijk 2–5 minuten, dus
--     15 is nog altijd ruim (3× de normale tijd) en halveert de blokkade meer dan.
--     Landt een betaling tóch later, dan vangt de bestaande race-guard in de webhook dat af:
--     die stort automatisch terug en verwittigt het lid — er gaat dus nooit geld verloren.
--  2) Max 2 openstaande reserveringen per lid tegelijk. Slots hamsteren met een handvol
--     afgebroken checkouts kan daarmee niet meer; wie netjes betaalt merkt er niets van.
--
-- Beide sweeps (de RPC én de BEFORE INSERT-trigger) gaan mee, zodat er geen venster overblijft
-- waarin de ene 15 min hanteert en de andere 35.

create or replace function public.expire_unpaid_bookings(p_gym uuid default null)
returns int language plpgsql security definer set search_path = public as $function$
declare n int;
begin
  with x as (
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where status = 'bevestigd' and paid = false and price_cents > 0
      and payment_source in ('los', 'abo')
      and created_at < now() - interval '15 minutes'
      and (p_gym is null or gym_id = p_gym)
    returning id, gym_id, user_id
  ),
  ins as (
    insert into notifications (gym_id, user_id, type, title, body, link)
    select x.gym_id, x.user_id, 'system',
           'Je onbetaalde boeking is verlopen',
           'De plek is weer vrijgegeven omdat de betaling niet binnen 15 minuten binnenkwam. Boek gerust opnieuw.',
           '/boeken'
    from x
    returning 1
  )
  select count(*) into n from x;
  return n;
end;
$function$;

create or replace function public.free_expired_slot()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.status = 'bevestigd' then
    update bookings set status = 'geannuleerd', cancelled_at = now()
    where gym_id = new.gym_id and starts_at = new.starts_at and status = 'bevestigd'
      and paid = false and price_cents > 0
      and payment_source in ('los', 'abo')
      and created_at < now() - interval '15 minutes';
  end if;
  return new;
end;
$function$;

-- ---------- Rem op hamsteren: max 2 openstaande reserveringen per lid ----------
create or replace function public.block_hoarding()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_open int;
begin
  -- Enkel echte betaalreserveringen tellen mee. Tegoed/abo-credit/gratis zijn meteen afgerekend
  -- en houden dus niets "open". Verlopen reserveringen (> 15 min) tellen ook niet: die zijn de
  -- facto vrij en worden door de sweep/trigger opgeruimd.
  if new.status = 'bevestigd' and new.paid = false and coalesce(new.price_cents, 0) > 0
     and new.payment_source in ('los', 'abo') then
    select count(*) into v_open from bookings
    where user_id = new.user_id and status = 'bevestigd' and paid = false
      and price_cents > 0 and payment_source in ('los', 'abo')
      and created_at >= now() - interval '15 minutes';
    if v_open >= 2 then
      raise exception 'Je hebt al 2 boekingen die op betaling wachten. Rond die eerst af — daarna kan je weer een moment vastzetten.' using errcode='P0001';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists block_hoarding_before on bookings;
create trigger block_hoarding_before before insert on bookings
  for each row execute function block_hoarding();
