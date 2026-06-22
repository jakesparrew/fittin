-- 0093_invoice_no_owner.sql
-- Allow the BETALER (a coach downloading the invoice for their own session-credit purchase) to assign
-- the gap-free invoice number too — not only the beheerder. Same single gym sequence, so numbering
-- stays opeenvolgend regardless of who generates the invoice first. Recreated from 0058.
create or replace function public.assign_invoice_no(p_payment uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_gym uuid; v_owner uuid; v_existing text; v_seq int; v_no text;
begin
  select gym_id, user_id into v_gym, v_owner from payments where id = p_payment;
  if v_gym is null then raise exception 'Betaling niet gevonden.' using errcode='P0001'; end if;
  -- Toegang: de beheerder van die gym, of de betaler zelf.
  if not (
    (is_beheerder() and (select gym_id from profiles where id = auth.uid()) = v_gym)
    or v_owner = auth.uid()
  ) then
    raise exception 'Geen toegang tot deze factuur.' using errcode='P0001';
  end if;
  select invoice_no into v_existing from payments where id = p_payment;
  if v_existing is not null then return v_existing; end if;
  update gyms set invoice_seq = invoice_seq + 1 where id = v_gym returning invoice_seq into v_seq;
  v_no := to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');
  update payments set invoice_no = v_no where id = p_payment;
  return v_no;
end; $$;
grant execute on function public.assign_invoice_no(uuid) to authenticated;
