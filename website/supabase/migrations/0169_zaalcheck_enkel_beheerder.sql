-- 0169 — Zaalchecks enkel leesbaar voor de beheerder, niet voor coaches.
-- is_staff() omvat coaches; via PostgREST kon een coach zo lezen wie er "vóór" een sessie zat. Het plan zegt:
-- enkel de uitbater. De beheerpagina gebruikt de service role; deze policy is het vangnet voor directe reads.
drop policy if exists zaal_checks_select on public.zaal_checks;
create policy zaal_checks_select on public.zaal_checks for select
  using (gym_id = public.current_gym_id() and public.is_beheerder());
drop policy if exists gamification_log_select on public.gamification_log;
create policy gamification_log_select on public.gamification_log for select
  using (gym_id = public.current_gym_id() and public.is_beheerder());
