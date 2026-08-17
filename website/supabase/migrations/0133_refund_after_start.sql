-- Een lid kon zijn beurt terugkrijgen door een sessie te annuleren die al voorbij was.
--
-- Hoe dat kon: `authenticated` mag `status` en `cancelled_at` van de eigen boeking wijzigen (dat is
-- bewust — de coach annuleert daarmee, migratie 0055 vergrendelde de rest van de kolommen). De
-- trigger refund_member_credit uit 0057 betaalt bij élke overgang naar 'geannuleerd' de beurt terug
-- en kent geen tijdvenster. De opmerking daar zegt "de annuleerroutes bewaken het venster zelf",
-- maar dat klopt niet meer: sinds gratis annuleren vervangen werd door verplaatsen-tot-6u bestaat
-- er geen ledenroute meer die dat venster bewaakt. Een lid kon dus na afloop van zijn sessie
-- rechtstreeks via de API status='geannuleerd' zetten en de beurt terugkrijgen — eindeloos.
--
-- Nagekeken op de live databank: 3 terugbetalingen in totaal, waarvan één op een reeds gestarte
-- sessie, en die werd door een coach gedaan (is_staff). Geen misbruik door leden.
--
-- Twee lagen, want één ervan kan later per ongeluk versoepeld worden:
--   1. RLS weigert een lid de annulering van een sessie die al begonnen is.
--   2. De trigger betaalt sowieso niet terug na de starttijd, tenzij personeel of de service-role
--      annuleert — die doen dat bewust (no-show kwijtschelden, coulance).

-- ── laag 1: RLS ────────────────────────────────────────────────────────────────────
-- USING kijkt naar de oude rij (wie mag deze rij aanraken), WITH CHECK naar de nieuwe (wat mag
-- eruit komen). Personeel houdt volledige vrijheid; een lid mag alles behalve met terugwerkende
-- kracht annuleren. De boekflow schrijft zelf stripe_session_id weg terwijl status ongemoeid
-- blijft — dat blijft dus gewoon toegestaan.
drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings
  for update
  using (user_id = auth.uid() or (gym_id = current_gym_id() and is_staff()))
  with check (
    (gym_id = current_gym_id() and is_staff())
    or (user_id = auth.uid() and (status <> 'geannuleerd' or starts_at > now()))
  );

-- ── laag 2: de trigger ─────────────────────────────────────────────────────────────
create or replace function public.refund_member_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hours int; v_mag boolean;
begin
  if new.status = 'geannuleerd' and old.status <> 'geannuleerd' and new.payment_source = 'credit' then
    -- Nog niet begonnen → gewone annulering, terugbetalen.
    -- Al begonnen → alleen terugbetalen als personeel of de service-role het doet; dat is dan een
    -- bewuste coulance-beslissing en geen lid dat zijn eigen sessie achteraf wegstreept.
    v_mag := new.starts_at > now() or auth.uid() is null or is_staff();
    if v_mag and not exists (select 1 from credits_ledger where ref_id = new.id and reason = 'refund') then
      v_hours := greatest(1, round(extract(epoch from (new.ends_at - new.starts_at)) / 3600.0)::int);
      insert into credits_ledger (gym_id, user_id, delta, reason, ref_id)
      values (new.gym_id, new.user_id, v_hours, 'refund', new.id);
    end if;
  end if;
  return new;
end; $$;
