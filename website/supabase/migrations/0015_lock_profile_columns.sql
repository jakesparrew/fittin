-- 0015: SECURITY FIX (pentest f-004, CWE-639 / OWASP A01) — vertical privilege escalation.
-- The profiles_update RLS policy had no WITH CHECK, so a member could PATCH their own
-- profiles.role to 'beheerder' (admin takeover). Lock column writes: members may only change
-- their own full_name + phone. role/gym_id/stripe_customer_id/welcome_* are no longer writable
-- via the API (authenticated). Role changes happen only via admin_set_role (security definer)
-- or the service_role key (server-side admin client) — both unaffected by these grants.

revoke update on profiles from authenticated, anon;
grant update (full_name, phone) on profiles to authenticated;

-- Belt-and-suspenders: pin row ownership/gym on update too.
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (id = auth.uid() or (gym_id = current_gym_id() and is_staff()))
  with check (id = auth.uid() or (gym_id = current_gym_id() and is_staff()));
