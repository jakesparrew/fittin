-- 0083_coach_connect.sql
-- Two-sided coach ↔ client connection. Either side sends a request; the other accepts. Until then the
-- link is 'pending' and the client isn't bookable. Admin-assigned links stay 'accepted'. Direct table
-- writes remain staff-only (RLS); members/coaches act only through these SECURITY DEFINER RPCs.

alter table coach_clients add column if not exists status       text not null default 'accepted';
alter table coach_clients add column if not exists requested_by text; -- 'coach' | 'client'

-- Coach invites a member to become their client.
create or replace function public.coach_request_client(p_client uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_coach uuid := auth.uid(); v_gym uuid; v_role user_role; v_id uuid; v_ex coach_clients%rowtype;
begin
  select gym_id, role into v_gym, v_role from profiles where id = v_coach;
  if v_role not in ('coach','beheerder') then raise exception 'Alleen coaches.' using errcode='P0001'; end if;
  if p_client = v_coach then raise exception 'Je kan jezelf niet koppelen.' using errcode='P0001'; end if;
  if not exists (select 1 from profiles where id = p_client and gym_id = v_gym) then raise exception 'Onbekend lid.' using errcode='P0001'; end if;
  select * into v_ex from coach_clients where gym_id = v_gym and coach_id = v_coach and client_id = p_client;
  if v_ex.id is not null then
    if v_ex.status = 'pending' and v_ex.requested_by = 'client' then update coach_clients set status='accepted' where id = v_ex.id; end if;
    return v_ex.id;
  end if;
  insert into coach_clients (gym_id, coach_id, client_id, status, requested_by)
  values (v_gym, v_coach, p_client, 'pending', 'coach') returning id into v_id;
  return v_id;
end; $$;

-- Member asks a coach to coach them.
create or replace function public.client_request_coach(p_coach uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_client uuid := auth.uid(); v_gym uuid; v_id uuid; v_ex coach_clients%rowtype;
begin
  select gym_id into v_gym from profiles where id = v_client;
  if v_gym is null then raise exception 'Geen profiel.' using errcode='P0001'; end if;
  if p_coach = v_client then raise exception 'Ongeldig.' using errcode='P0001'; end if;
  if not exists (select 1 from profiles where id = p_coach and gym_id = v_gym and role in ('coach','beheerder')) then raise exception 'Onbekende coach.' using errcode='P0001'; end if;
  select * into v_ex from coach_clients where gym_id = v_gym and coach_id = p_coach and client_id = v_client;
  if v_ex.id is not null then
    if v_ex.status = 'pending' and v_ex.requested_by = 'coach' then update coach_clients set status='accepted' where id = v_ex.id; end if;
    return v_ex.id;
  end if;
  insert into coach_clients (gym_id, coach_id, client_id, status, requested_by)
  values (v_gym, p_coach, v_client, 'pending', 'client') returning id into v_id;
  return v_id;
end; $$;

-- The party that did NOT request accepts (true) or declines (false → delete).
create or replace function public.respond_coach_link(p_link uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_l coach_clients%rowtype;
begin
  select * into v_l from coach_clients where id = p_link;
  if v_l.id is null then raise exception 'Aanvraag niet gevonden.' using errcode='P0001'; end if;
  if v_l.requested_by = 'coach' and v_l.client_id <> v_uid then raise exception 'Geen rechten.' using errcode='P0001'; end if;
  if v_l.requested_by = 'client' and v_l.coach_id <> v_uid then raise exception 'Geen rechten.' using errcode='P0001'; end if;
  if p_accept then update coach_clients set status='accepted' where id = p_link;
  else delete from coach_clients where id = p_link; end if;
end; $$;

-- Either party (or staff) removes the link (cancel a pending invite or end a connection).
create or replace function public.remove_coach_link(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_l coach_clients%rowtype;
begin
  select * into v_l from coach_clients where id = p_link;
  if v_l.id is null then return; end if;
  if v_l.coach_id <> v_uid and v_l.client_id <> v_uid and not is_beheerder() then raise exception 'Geen rechten.' using errcode='P0001'; end if;
  delete from coach_clients where id = p_link;
end; $$;

grant execute on function public.coach_request_client(uuid) to authenticated;
grant execute on function public.client_request_coach(uuid) to authenticated;
grant execute on function public.respond_coach_link(uuid, boolean) to authenticated;
grant execute on function public.remove_coach_link(uuid) to authenticated;
