-- 0063: harden the member-plans feature (adversarial review: RLS-1, RLS-2, AI-1, equipment label).

-- RLS-1 (critical): the member write policy only pinned member_id, so a member using the anon key
-- could forge is_template=true, an arbitrary gym_id (cross-tenant), or a coach_id (impersonation).
-- Pin every escalation column in WITH CHECK. Members write only their own, same-gym, non-template,
-- coach-less plans. (Coach-assigned plans keep coach_id set, so members can't rewrite the row —
-- their day/exercise edits go through the separate program_days/ex policies which still apply.)
drop policy if exists programs_member_write on programs;
create policy programs_member_write on programs for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid() and gym_id = current_gym_id() and is_template = false and coach_id is null);

-- RLS-2 (critical): only copy genuine GYM templates (member_id null), never a member-forged
-- "template" — otherwise a member could clone another member's plan via this SECURITY DEFINER RPC.
create or replace function public.copy_template_to_member(p_template uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_gym uuid; v_new uuid; v_name text; d record; nd uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = v_uid;
  select name into v_name from programs
    where id = p_template and is_template and member_id is null and gym_id = v_gym;
  if v_name is null then raise exception 'Sjabloon niet gevonden.' using errcode='P0001'; end if;
  insert into programs (gym_id, member_id, coach_id, name, is_template, is_active)
    values (v_gym, v_uid, null, v_name, false, false) returning id into v_new;
  for d in select * from program_days where program_id = p_template order by day_no loop
    insert into program_days (program_id, day_no, name) values (v_new, d.day_no, d.name) returning id into nd;
    insert into program_exercises (program_day_id, exercise_id, sets, reps, rest_sec, position)
      select nd, pe.exercise_id, pe.sets, pe.reps, pe.rest_sec, pe.position
      from program_exercises pe where pe.program_day_id = d.id;
  end loop;
  return v_new;
end; $$;
grant execute on function public.copy_template_to_member(uuid) to authenticated;

-- AI-1 (high): rate-limit log for paid AI generation (cost protection).
create table if not exists ai_generations (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid references gyms(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null default 'plan',
  created_at timestamptz not null default now()
);
create index if not exists ai_generations_user_idx on ai_generations(user_id, created_at);
alter table ai_generations enable row level security;
drop policy if exists ai_generations_own on ai_generations;
create policy ai_generations_own on ai_generations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Equipment label consistency: the curated 0060 seed used English 'Bodyweight'; everything else
-- (importer + AI equipment preset) uses 'Lichaamsgewicht'. Normalise so filters match.
update exercises set equipment = 'Lichaamsgewicht' where equipment = 'Bodyweight';
