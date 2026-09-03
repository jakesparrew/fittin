-- 0152 — Aanbrengvergoeding: een coach betaalt extra voor klanten die Fittin' hem doorgeeft.
--
-- Owner-beslissing (2026-09-03): "Per boeking van een coach die met een lead komt is een 0.5 credit
-- dus 6 euro, niet meer." Dus PER BOEKING, niet per uur: een sessie van 2 uur kost 2 beurten zaal
-- + 0,5 beurt aanbreng, niet 1 beurt aanbreng.
--
-- WAAROM IN BEURTEN EN NIET IN EURO'S: een aparte geldstroom zou een tweede factuur, een tweede
-- btw-vraag en een tweede incassoprobleem betekenen. Een halve beurt extra loopt door de koopstroom,
-- het saldo, de factuur en de negatief-saldo-rem die vandaag al bestaan. Voor de boekhouding is dat
-- één regel: een hoger sessietarief voor aangebrachte klanten.
--
-- WAT DIT NIET RAAKT: het lidtarief. create_booking en admin_create_booking komen hier niet voor —
-- een lid dat zelf boekt betaalt exact hetzelfde als vroeger. De aanbreng bestaat uitsluitend in
-- coach_ledger, het tegoedboek van de coach.
--
-- DE KOST HANGT AAN DE BOEKING, NIET AAN EEN ENKELE FUNCTIE. Er zijn drie paden waarlangs een
-- sessie een client krijgt: coach_book_session (coachdashboard), coachAssignClient (client later
-- aan een gereserveerd slot hangen) en de beheerderspaden. Een controle in de RPC zou de andere
-- twee missen. Daarom rekent één trigger op bookings, zoals refund_coach_credit (0024) dat voor
-- annulaties doet.

-- ---------- 1. Instellingen op de gym ----------
-- Standaardtarief voor nieuwe doorgaven. Apart tarief voor een intake waarin de klant zelf al een
-- voorkeurcoach aanduidde: daar levert Fittin' de klant maar niet de matching. Owner kan beide in
-- /beheer/aanbreng wijzigen; het tarief van een lopende doorgave verandert daar niet door.
alter table public.gyms add column if not exists referral_fee_cents int not null default 600;
alter table public.gyms add column if not exists referral_fee_voorkeur_cents int not null default 600;
alter table public.gyms drop constraint if exists gyms_referral_fee_ck;
alter table public.gyms add constraint gyms_referral_fee_ck check (referral_fee_cents between 0 and 1200);
alter table public.gyms drop constraint if exists gyms_referral_fee_voorkeur_ck;
alter table public.gyms add constraint gyms_referral_fee_voorkeur_ck check (referral_fee_voorkeur_cents between 0 and 1200);

-- ---------- 2. Twee schakelaars op het coachprofiel ----------
--   coach_accepting_clients — de coach zelf: "ik neem nieuwe klanten aan". Staat die uit, dan
--     verdwijnt hij uit de intake-keuzelijst en kan niemand hem via de site aanvragen.
--   coach_require_client — de gym: "deze coach moet bij elke boeking zeggen wie er traint".
--     Standaard uit; springt aan zodra hij een aangebrachte klant aanvaardt.
alter table public.profiles add column if not exists coach_accepting_clients boolean not null default true;
alter table public.profiles add column if not exists coach_require_client boolean not null default false;
-- 0132 verving de tabelbrede rechten door kolomrechten: een NIEUWE kolom erft dus niets en zou
-- onschrijfbaar zijn voor de service-role. Expliciet toekennen; anon krijgt niets extra.
grant select (coach_accepting_clients, coach_require_client) on public.profiles to authenticated, service_role;
grant update (coach_accepting_clients, coach_require_client) on public.profiles to service_role;

-- ---------- 3. De doorgave zelf ----------
-- Append-only. Een doorgave wordt beeindigd, nooit gewist: ze is het bewijs van de afspraak achter
-- elke aangerekende halve beurt.
--
-- client_id mag NULL zijn. Een intake komt binnen met een e-mailadres en nog geen account; de
-- doorgave bestaat dus voor de persoon bestaat. De koppeling gebeurt automatisch zodra er een
-- profiel met dat adres opduikt (trigger verderop).
create table if not exists public.gym_referrals (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  coach_id      uuid not null references public.profiles(id) on delete cascade,
  client_id     uuid references public.profiles(id) on delete set null,
  client_email  text not null,
  client_name   text,
  source        text not null default 'intake' check (source in ('intake', 'manueel')),
  status        text not null default 'voorgesteld' check (status in ('voorgesteld', 'aanvaard', 'geweigerd', 'beeindigd')),
  -- Bevroren bij aanvaarding: wie later het standaardtarief wijzigt, raakt lopende afspraken niet.
  fee_cents     int not null default 600 check (fee_cents between 0 and 1200),
  sessions_cap  int check (sessions_cap is null or sessions_cap > 0),   -- null = onbeperkt
  months_cap    int check (months_cap is null or months_cap > 0),       -- null = onbeperkt
  referred_at   timestamptz not null default now(),
  accepted_at   timestamptz,
  ended_at      timestamptz,
  ended_by      uuid references public.profiles(id) on delete set null,
  ended_reason  text,
  inbound_email_id uuid references public.inbound_emails(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists gym_referrals_coach_idx  on public.gym_referrals (coach_id, status);
create index if not exists gym_referrals_client_idx on public.gym_referrals (client_id) where client_id is not null;
create index if not exists gym_referrals_email_idx  on public.gym_referrals (gym_id, lower(client_email));
-- Een lopende doorgave per coach-en-e-mailadres. Een beeindigde doorgave blokkeert een nieuwe niet.
create unique index if not exists gym_referrals_actief_uniek
  on public.gym_referrals (gym_id, coach_id, lower(client_email))
  where status in ('voorgesteld', 'aanvaard');

alter table public.gym_referrals enable row level security;
-- Lezen: de betrokken coach ziet zijn eigen doorgaven, personeel ziet die van de gym. Schrijven
-- gebeurt uitsluitend via de service-role (server actions na een identiteitscontrole) — er is
-- bewust geen insert/update/delete-policy.
drop policy if exists gym_referrals_select on public.gym_referrals;
create policy gym_referrals_select on public.gym_referrals for select
  using (coach_id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
revoke all on public.gym_referrals from public, anon, authenticated;
grant select on public.gym_referrals to authenticated;
grant select, insert, update on public.gym_referrals to service_role;

-- Beheerdersbeslissing "deze sessie zonder client is nagekeken". Zonder dit zou dezelfde rij elke
-- dag opnieuw bovenaan de controlelijst staan.
create table if not exists public.gym_referral_checks (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  checked_at timestamptz not null default now(),
  checked_by uuid references public.profiles(id) on delete set null,
  note       text
);
alter table public.gym_referral_checks enable row level security;
drop policy if exists gym_referral_checks_select on public.gym_referral_checks;
create policy gym_referral_checks_select on public.gym_referral_checks for select
  using (gym_id = current_gym_id() and is_staff());
revoke all on public.gym_referral_checks from public, anon, authenticated;
grant select on public.gym_referral_checks to authenticated;
grant select, insert, update, delete on public.gym_referral_checks to service_role;

-- ---------- 4. Het tegoedboek kan nu halve en kwart beurten dragen ----------
-- numeric(6,1) kon 0,5 wel aan maar 3 euro (0,25 beurt) niet. Twee decimalen laat de owner het
-- tarief vrij kiezen zonder nieuwe migratie. Alle bestaande saldi blijven identiek.
alter table public.coach_ledger alter column delta type numeric(8,2);
alter table public.coach_ledger add column if not exists referral_id uuid references public.gym_referrals(id) on delete set null;
grant select (referral_id) on public.coach_ledger to authenticated, service_role;
grant insert (referral_id), update (referral_id) on public.coach_ledger to service_role;
create index if not exists coach_ledger_referral_idx on public.coach_ledger (referral_id) where referral_id is not null;

-- ---------- 5. De trigger die aanrekent en terugbetaalt ----------
-- Idempotent per boeking: er wordt gerekend met de NETTO stand van deze boeking (aanbreng +
-- aanbreng_terug). Staat die op 0, dan mag er aangerekend worden; staat ze negatief, dan is er al
-- betaald en gebeurt er niets. Zo respecteert dezelfde trigger ook een handmatige aanrekening door
-- de beheerder en draait ze die netjes terug bij een annulering.
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
    select cl.gym_id, cl.coach_id, -v_net, 'aanbreng_terug', new.id, max(cl.referral_id)
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

drop trigger if exists charge_referral_fee_after on public.bookings;
create trigger charge_referral_fee_after
  after insert or update of user_id, coach_id, status, coach_billing on public.bookings
  for each row execute function public.charge_referral_fee();

-- ---------- 6. De doorgave koppelt zichzelf aan het account ----------
-- Een intake bestaat voor het account. Zodra er een profiel met dat e-mailadres in deze gym
-- opduikt, hangt de doorgave eraan vast. Hoofdletters doen er niet toe.
create or replace function public.link_referral_to_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or new.gym_id is null then return new; end if;
  update gym_referrals
     set client_id = new.id
   where client_id is null
     and gym_id = new.gym_id
     and lower(client_email) = lower(new.email)
     and status in ('voorgesteld', 'aanvaard');
  return new;
end; $$;
drop trigger if exists link_referral_to_profile_after on public.profiles;
create trigger link_referral_to_profile_after
  after insert or update of email, gym_id on public.profiles
  for each row execute function public.link_referral_to_profile();

-- ---------- 7. Boeken kent de aanbreng vooraf ----------
-- Twee dingen komen erbij:
--   * p_client_name — de naam van een externe client hoort IN de boeking, niet in een losse update
--     achteraf. Alleen zo kan de databank afdwingen dat er altijd een naam bekend is.
--   * de saldocontrole telt de aanbreng mee. Een coach met 1 beurt kan geen sessie van 1,5 boeken.
-- De rest van de functie is ongewijzigd overgenomen uit 0128.
drop function if exists public.coach_book_session(uuid, uuid, date, numeric, integer, boolean, numeric);
create function public.coach_book_session(p_client uuid, p_service uuid, p_date date, p_hour numeric, p_persons integer default 1, p_use_client_credit boolean default false, p_hours numeric default 1, p_client_name text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_coach uuid := auth.uid();
  v_gym uuid; v_role user_role; v_mode text; v_price int;
  v_srv services%rowtype; v_open int; v_close int;
  v_user uuid; v_start timestamptz; v_end timestamptz; v_id uuid; v_billing text; v_charge int; v_cbal int;
  v_lbal numeric;
  v_hours numeric := coalesce(p_hours, 1);
  v_owed_sessions int; v_owed_invoices int; v_owed int;
  v_naam text := nullif(btrim(coalesce(p_client_name, '')), '');
  v_verplicht boolean; v_fee numeric := 0;
begin
  if v_coach is null then raise exception 'Alleen coaches kunnen dit.' using errcode='P0001'; end if;
  select gym_id, role, coach_billing_mode, coach_session_price_cents, coach_require_client
    into v_gym, v_role, v_mode, v_price, v_verplicht from profiles where id = v_coach;
  if v_role is null or v_role not in ('coach', 'beheerder') then raise exception 'Alleen coaches kunnen dit.' using errcode='P0001'; end if;
  if p_hour * 2 <> round(p_hour * 2) then raise exception 'Ongeldig tijdslot.' using errcode='P0001'; end if;
  if v_hours * 2 <> round(v_hours * 2) or v_hours < 1 or v_hours > 4 then
    raise exception 'Ongeldige duur.' using errcode='P0001';
  end if;

  -- Wie traint hier? Bij een coach met aangebrachte klanten mag dat niet leeg blijven: anders is de
  -- vergoeding onhandhaafbaar en betaalt de eerlijke coach voor de rest.
  if v_verplicht and p_client is null and v_naam is null then
    raise exception 'Kies je client, of vul de naam van je externe client in — bij jou is dat verplicht.' using errcode='P0001';
  end if;

  if p_client is not null then
    if not exists (select 1 from profiles where id = p_client and gym_id = v_gym) then
      raise exception 'Onbekende client.' using errcode='P0001'; end if;
    if v_role = 'coach' and not exists (
      select 1 from coach_clients where coach_id = v_coach and client_id = p_client and gym_id = v_gym and status = 'accepted'
    ) then raise exception 'Dit is niet jouw (verbonden) client.' using errcode='P0001'; end if;
  end if;
  v_user := coalesce(p_client, v_coach);

  select * into v_srv from services where id = p_service and gym_id = v_gym and active;
  if v_srv.id is null then raise exception 'Onbekende sessie.' using errcode='P0001'; end if;
  if p_persons < 1 or p_persons > v_srv.capacity then raise exception 'Ongeldig aantal personen.' using errcode='P0001'; end if;
  select open_hour, close_hour into v_open, v_close from gyms where id = v_gym;
  if p_hour < v_open or p_hour >= v_close then raise exception 'Buiten de openingsuren.' using errcode='P0001'; end if;
  if p_hour + v_hours > v_close then raise exception 'De gekozen duur valt buiten de openingsuren.' using errcode='P0001'; end if;

  v_start := (p_date + make_interval(mins => round(p_hour * 60)::int)) at time zone 'Europe/Brussels';
  v_end   := v_start + make_interval(mins => round(v_hours * 60)::int);
  if v_start < now() then raise exception 'Dit tijdslot is al verlopen.' using errcode='P0001'; end if;
  if exists (select 1 from slot_blocks sb where sb.gym_id = v_gym
              and tstzrange(sb.starts_at, sb.ends_at) && tstzrange(v_start, v_end)) then
    raise exception 'Dit tijdslot is geblokkeerd.' using errcode='P0001';
  end if;

  if p_client is not null and p_use_client_credit then
    select coalesce(sum(delta), 0) into v_cbal from coach_credit_ledger where coach_id = v_coach and client_id = p_client;
    if v_cbal < 1 then raise exception 'Deze client heeft geen sessietegoed bij jou.' using errcode='P0001'; end if;
  end if;

  if v_mode = 'free' then
    v_billing := 'free'; v_charge := 0;
  else
    perform pg_advisory_xact_lock(hashtext('coach_invoice:' || v_coach::text));
    select coalesce(sum(coach_charge_cents), 0) into v_owed_sessions
      from bookings
     where coach_id = v_coach and coach_billing = 'invoice'
       and status = 'bevestigd' and coach_invoiced_at is null;
    select coalesce(sum(amount_cents), 0) into v_owed_invoices
      from payments
     where user_id = v_coach and status = 'onbetaald' and kind = 'coach_credits';
    v_owed := v_owed_sessions + v_owed_invoices;
    if v_owed > 0 then
      raise exception 'Je hebt nog EUR % openstaan bij de gym. Zuiver dat eerst aan — daarna kan je weer boeken met sessietegoed.',
        to_char(round(v_owed / 100.0, 2), 'FM999999990.00') using errcode='P0001';
    end if;

    -- Aanbrengvergoeding vooraf meetellen: een halve beurt per BOEKING (owner-beslissing), niet per
    -- uur. De trigger schrijft ze straks weg; hier voorkomen we dat de coach eerst boekt en pas
    -- daarna ziet dat hij in de min staat.
    if p_client is not null then
      select round(r.fee_cents / 1200.0, 2) into v_fee
        from gym_referrals r
       where r.gym_id = v_gym and r.coach_id = v_coach and r.client_id = p_client
         and r.status = 'aanvaard' and r.ended_at is null and v_start >= r.referred_at
         and (r.months_cap is null or v_start < coalesce(r.accepted_at, r.referred_at) + make_interval(months => r.months_cap))
       order by r.referred_at limit 1;
      v_fee := coalesce(v_fee, 0);
    end if;

    perform pg_advisory_xact_lock(hashtext('coach_ledger:' || v_coach::text));
    select coalesce(sum(delta), 0) into v_lbal from coach_ledger where coach_id = v_coach;
    if v_lbal < v_hours + v_fee then
      raise exception 'Onvoldoende sessietegoed (saldo: %, nodig: %). Koop eerst tegoed bij — elke sessie wordt vooraf betaald.', v_lbal, v_hours + v_fee using errcode='P0001';
    end if;
    v_billing := 'credit'; v_charge := 0;
  end if;

  begin
    insert into bookings (gym_id, service_id, user_id, coach_id, starts_at, ends_at, persons, payment_source, price_cents, paid, coach_billing, coach_charge_cents, notes)
    values (v_gym, v_srv.id, v_user, v_coach, v_start, v_end, p_persons, 'los', 0, true, v_billing, v_charge, case when p_client is null then v_naam else null end)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    raise exception 'Dit tijdslot is al geboekt.' using errcode='P0001';
  end;

  if v_billing = 'credit' then
    insert into coach_ledger (gym_id, coach_id, delta, reason, ref_id) values (v_gym, v_coach, -v_hours, 'sessie', v_id);
  end if;
  if p_client is not null and p_use_client_credit then
    insert into coach_credit_ledger (gym_id, coach_id, client_id, delta, reason, ref_id) values (v_gym, v_coach, p_client, -1, 'sessie', v_id);
  end if;
  return v_id;
end; $function$;

-- Na een drop vallen de rechten terug op de standaard (PUBLIC mag uitvoeren). Per rol intrekken —
-- alleen `revoke from public` laat de expliciete Supabase-grants staan (les uit 0142).
revoke all on function public.coach_book_session(uuid, uuid, date, numeric, integer, boolean, numeric, text) from public, anon;
grant execute on function public.coach_book_session(uuid, uuid, date, numeric, integer, boolean, numeric, text) to authenticated, service_role;

-- ---------- 8. Een coach die dicht staat, krijgt geen nieuwe klanten ----------
create or replace function public.client_request_coach(p_coach uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_client uuid := auth.uid(); v_gym uuid; v_id uuid; v_ex coach_clients%rowtype; v_open boolean;
begin
  select gym_id into v_gym from profiles where id = v_client;
  if v_gym is null then raise exception 'Geen profiel.' using errcode='P0001'; end if;
  if p_coach = v_client then raise exception 'Ongeldig.' using errcode='P0001'; end if;
  select coach_accepting_clients into v_open from profiles
   where id = p_coach and gym_id = v_gym and role in ('coach','beheerder');
  if v_open is null then raise exception 'Onbekende coach.' using errcode='P0001'; end if;
  select * into v_ex from coach_clients where gym_id = v_gym and coach_id = p_coach and client_id = v_client;
  -- Een lopende uitnodiging van de coach zelf blijft altijd aanvaardbaar: hij vroeg er zelf om.
  if v_ex.id is not null then
    if v_ex.status = 'pending' and v_ex.requested_by = 'coach' then update coach_clients set status='accepted' where id = v_ex.id; end if;
    return v_ex.id;
  end if;
  if not v_open then
    raise exception 'Deze coach neemt momenteel geen nieuwe klanten aan.' using errcode='P0001';
  end if;
  insert into coach_clients (gym_id, coach_id, client_id, status, requested_by)
  values (v_gym, p_coach, v_client, 'pending', 'client') returning id into v_id;
  return v_id;
end; $function$;

-- ---------- 9. Overzicht voor het beheerdersdashboard ----------
-- Per doorgave: hoeveel sessies er netto betaald zijn en hoeveel dat opbracht. Bewust een functie
-- en geen view: een view erft de rechten van de eigenaar, en dit mag alleen de service-role zien.
create or replace function public.referral_overzicht(p_gym uuid)
returns table (referral_id uuid, sessies bigint, beurten numeric, laatste timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id,
         count(*) filter (where t.netto < 0),
         coalesce(-sum(t.netto) filter (where t.netto < 0), 0),
         max(t.laatste)
    from gym_referrals r
    left join (
      select cl.referral_id, cl.ref_id, sum(cl.delta) as netto, max(cl.created_at) as laatste
        from coach_ledger cl
       where cl.reason in ('aanbreng', 'aanbreng_terug')
       group by cl.referral_id, cl.ref_id
    ) t on t.referral_id = r.id
   where r.gym_id = p_gym
   group by r.id;
$$;
revoke all on function public.referral_overzicht(uuid) from public, anon, authenticated;
grant execute on function public.referral_overzicht(uuid) to service_role;
