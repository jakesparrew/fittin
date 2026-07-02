-- 0098_beheerder_only_write_policies.sql
-- FIX (security): several beheerder-only config/money tables had RLS WRITE policies gated on
-- is_staff() (coach OR beheerder) while the app enforces beheerder-only. A coach could therefore
-- bypass the UI and write these directly via PostgREST with their own JWT — e.g. rewrite the €15
-- session price, packages, block gym slots, or edit the newsletter (campaigns.body_html feeds a
-- dangerouslySetInnerHTML preview → coach→superadmin stored-XSS chain).
-- Tighten the WRITE policies to is_beheerder() (helper already exists). SELECT stays public where it
-- was (services/packages/slot_blocks/events are read by public pages).
--
-- NOTE: 'events' is intentionally NOT flipped — coaches legitimately create group events via the
-- user client (coaching-actions.js), so events_write must stay is_staff().

-- services (session price!)
drop policy if exists services_write on services;
create policy services_write on services for all
  using (gym_id = current_gym_id() and is_beheerder())
  with check (gym_id = current_gym_id() and is_beheerder());

-- packages (punch-card price!)
drop policy if exists packages_write on packages;
create policy packages_write on packages for all
  using (gym_id = current_gym_id() and is_beheerder())
  with check (gym_id = current_gym_id() and is_beheerder());

-- slot_blocks (blocking the gym calendar)
drop policy if exists slot_blocks_write on slot_blocks;
create policy slot_blocks_write on slot_blocks for all
  using (gym_id = current_gym_id() and is_beheerder())
  with check (gym_id = current_gym_id() and is_beheerder());

-- subscribers (newsletter recipient list / PII)
drop policy if exists subscribers_staff on subscribers;
create policy subscribers_staff on subscribers for all
  using (gym_id = current_gym_id() and is_beheerder())
  with check (gym_id = current_gym_id() and is_beheerder());

-- campaigns (newsletter body_html → XSS source)
drop policy if exists campaigns_staff on campaigns;
create policy campaigns_staff on campaigns for all
  using (gym_id = current_gym_id() and is_beheerder())
  with check (gym_id = current_gym_id() and is_beheerder());

-- campaign_steps (drip email bodies)
drop policy if exists campaign_steps_staff on campaign_steps;
create policy campaign_steps_staff on campaign_steps for all
  using (exists (select 1 from campaigns c where c.id = campaign_id and c.gym_id = current_gym_id() and is_beheerder()))
  with check (exists (select 1 from campaigns c where c.id = campaign_id and c.gym_id = current_gym_id() and is_beheerder()));

-- campaign_sends (send log — read)
drop policy if exists campaign_sends_staff on campaign_sends;
create policy campaign_sends_staff on campaign_sends for select
  using (gym_id = current_gym_id() and is_beheerder());
