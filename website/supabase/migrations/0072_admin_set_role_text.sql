-- 0072: fix role changes from the admin UI (lid ↔ coach ↔ beheerder).
-- admin_set_role(uuid, user_role) took a `user_role` ENUM param, but supabase-js/PostgREST sends
-- p_role as a bound TEXT parameter and text→user_role has no implicit cast → the call resolved to
-- a non-existent admin_set_role(uuid, text) and errored ("function ... does not exist"). The server
-- action returned that error, and the plain <form action> in the admin UI swallowed it, so the role
-- selector just snapped back. Redefine with a TEXT param that is validated + cast to the enum inside.
drop function if exists public.admin_set_role(uuid, user_role);

create or replace function public.admin_set_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_gym uuid;
begin
  if p_role not in ('lid', 'coach', 'beheerder') then
    raise exception 'Ongeldige rol.' using errcode='P0001';
  end if;
  if (select role from profiles where id = auth.uid()) <> 'beheerder' then
    raise exception 'Alleen beheerder.' using errcode='P0001';
  end if;
  select gym_id into v_gym from profiles where id = auth.uid();
  update profiles set role = p_role::user_role where id = p_member and gym_id = v_gym;
end; $$;

grant execute on function public.admin_set_role(uuid, text) to authenticated;
