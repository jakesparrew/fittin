-- 0100_credit_expiry_detail.sql
-- Companion to 0095 (FIFO balance): expose WHEN the remaining credits expire, so the account page
-- can show "waarvan X vervalt op {datum}" and a cron can warn before paid sessions evaporate.
-- Same FIFO walk as credits_balance(): usage consumes the oldest grants first; whatever remains on
-- a non-expired grant counts, and the earliest expires_at among surviving grants is the next expiry.

create or replace function public.credits_balance_detail(p_user uuid)
returns table(balance int, next_expiry timestamptz, expiring int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_used numeric := 0;
  v_avail numeric := 0;
  v_next timestamptz := null;
  v_next_amt numeric := 0;
  r record;
  v_left numeric;
begin
  if p_user is null then return query select 0, null::timestamptz, 0; return; end if;
  if auth.uid() is not null and p_user <> auth.uid() and not is_beheerder() then
    raise exception 'Geen toegang.' using errcode='P0001';
  end if;
  select coalesce(-sum(delta), 0) into v_used from credits_ledger where user_id = p_user and delta < 0;
  for r in
    select delta, expires_at from credits_ledger
    where user_id = p_user and delta > 0
    order by created_at asc, id asc
  loop
    if v_used >= r.delta then
      v_used := v_used - r.delta;
    else
      v_left := r.delta - v_used;
      v_used := 0;
      if r.expires_at is null or r.expires_at > now() then
        v_avail := v_avail + v_left;
        if r.expires_at is not null and (v_next is null or r.expires_at < v_next) then
          v_next := r.expires_at;
        end if;
      end if;
    end if;
  end loop;
  -- How many of the surviving credits sit on grants expiring at that earliest date.
  if v_next is not null then
    v_used := (select coalesce(-sum(delta), 0) from credits_ledger where user_id = p_user and delta < 0);
    for r in
      select delta, expires_at from credits_ledger
      where user_id = p_user and delta > 0
      order by created_at asc, id asc
    loop
      if v_used >= r.delta then v_used := v_used - r.delta;
      else
        v_left := r.delta - v_used; v_used := 0;
        if r.expires_at = v_next then v_next_amt := v_next_amt + v_left; end if;
      end if;
    end loop;
  end if;
  return query select greatest(0, floor(v_avail))::int, v_next, greatest(0, floor(v_next_amt))::int;
end;
$$;
grant execute on function public.credits_balance_detail(uuid) to authenticated;
