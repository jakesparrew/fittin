-- 0062: members build, save and activate their OWN workout plans (not only coach-assigned).
-- Adds an active-plan flag, member-owned RLS write access, and a template-copy RPC.

alter table programs add column if not exists is_active boolean not null default false;
create index if not exists programs_member_active_idx on programs(member_id) where is_active;

-- Members can create/edit/delete THEIR OWN plans. Staff policies (0001) remain in force alongside.
drop policy if exists programs_member_write on programs;
create policy programs_member_write on programs for all
  using (member_id = auth.uid()) with check (member_id = auth.uid());

drop policy if exists program_days_member_write on program_days;
create policy program_days_member_write on program_days for all
  using (exists (select 1 from programs p where p.id = program_id and p.member_id = auth.uid()))
  with check (exists (select 1 from programs p where p.id = program_id and p.member_id = auth.uid()));

drop policy if exists program_ex_member_write on program_exercises;
create policy program_ex_member_write on program_exercises for all
  using (exists (select 1 from program_days d join programs p on p.id = d.program_id
                 where d.id = program_day_id and p.member_id = auth.uid()))
  with check (exists (select 1 from program_days d join programs p on p.id = d.program_id
                 where d.id = program_day_id and p.member_id = auth.uid()));

-- Exactly one active plan per member: activating one deactivates the others.
create or replace function public.set_active_plan(p_program uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_owner uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select member_id into v_owner from programs where id = p_program;
  if v_owner is null or v_owner <> v_uid then raise exception 'Geen eigen plan.' using errcode='P0001'; end if;
  update programs set is_active = (id = p_program) where member_id = v_uid;
end; $$;
grant execute on function public.set_active_plan(uuid) to authenticated;

-- Copy a gym template into the member's account as an editable, non-template plan.
create or replace function public.copy_template_to_member(p_template uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_gym uuid; v_new uuid; v_name text; d record; nd uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select gym_id into v_gym from profiles where id = v_uid;
  select name into v_name from programs where id = p_template and is_template and gym_id = v_gym;
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
