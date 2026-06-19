-- 0064: atomic ordinals + ownership for member plan edits (review plannen-2, plannen-3).
-- Computes day_no / position inside an advisory-locked transaction so concurrent adds can't
-- collide, and enforces ownership + same-gym exercise at the DB level (defence beyond RLS).

create or replace function public.add_plan_day(p_program uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_next int; v_id uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select member_id into v_owner from programs where id = p_program;
  if v_owner is null or v_owner <> v_uid then raise exception 'Geen eigen plan.' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_program::text, 1));
  select coalesce(max(day_no), 0) + 1 into v_next from program_days where program_id = p_program;
  insert into program_days (program_id, day_no, name)
    values (p_program, v_next, coalesce(nullif(btrim(p_name), ''), 'Dag ' || v_next))
    returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.add_plan_day(uuid, text) to authenticated;

create or replace function public.add_plan_exercise(p_day uuid, p_exercise uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_gym uuid; v_exgym uuid; v_next int; v_id uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd.' using errcode='P0001'; end if;
  select p.member_id, p.gym_id into v_owner, v_gym
    from program_days d join programs p on p.id = d.program_id where d.id = p_day;
  if v_owner is null or v_owner <> v_uid then raise exception 'Geen eigen plan.' using errcode='P0001'; end if;
  select gym_id into v_exgym from exercises where id = p_exercise;
  if v_exgym is null or v_exgym <> v_gym then raise exception 'Onbekende oefening.' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_day::text, 2));
  select coalesce(max(position), -1) + 1 into v_next from program_exercises where program_day_id = p_day;
  insert into program_exercises (program_day_id, exercise_id, sets, reps, rest_sec, position)
    values (p_day, p_exercise, 3, 10, 90, v_next)
    returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.add_plan_exercise(uuid, uuid) to authenticated;
