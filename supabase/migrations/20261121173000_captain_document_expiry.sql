-- Captain documents already need a printed expiry date for the licence, RC, and the carpool papers.
-- The desk writes expires_on and expiry_notice. Those columns were missing, so the two dated
-- inserts failed and the captain was still marked active. This file only adds the columns and
-- one approval function. It does not approve anyone and it does not invent document rows.
-- Apply it only after a separate approval. Do not apply it to production from this phase.

alter table public.captain_documents add column if not exists expires_on date;
alter table public.captain_documents add column if not exists expiry_notice integer;

create or replace function public.approve_captain_review(
  p_captain uuid,
  p_required text[],
  p_expiring text[],
  p_today date,
  p_need_car boolean
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_kind text;
begin
  select status into v_status
  from public.captains
  where user_id = p_captain
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing_captain');
  end if;

  if v_status is distinct from 'review' then
    return jsonb_build_object('ok', false, 'reason', 'decided');
  end if;

  select kind into v_kind
  from unnest(p_required) as kind
  where not exists (
    select 1
    from public.captain_documents as document
    where document.captain_id = p_captain
      and document.kind = kind
      and document.status = 'verified'
  )
  limit 1;

  if v_kind is not null then
    return jsonb_build_object('ok', false, 'reason', 'missing', 'kind', v_kind);
  end if;

  select document.kind into v_kind
  from public.captain_documents as document
  where document.captain_id = p_captain
    and document.kind = any (p_required)
    and document.status = 'rejected'
  limit 1;

  if v_kind is not null then
    return jsonb_build_object('ok', false, 'reason', 'rejected', 'kind', v_kind);
  end if;

  select kind into v_kind
  from unnest(p_expiring) as kind
  where kind = any (p_required)
    and exists (
      select 1
      from public.captain_documents as document
      where document.captain_id = p_captain
        and document.kind = kind
        and document.status = 'verified'
        and (document.expires_on is null or document.expires_on <= p_today)
    )
  limit 1;

  if v_kind is not null then
    return jsonb_build_object('ok', false, 'reason', 'expired', 'kind', v_kind);
  end if;

  if p_need_car and not exists (
    select 1 from public.seat_cars as car
    where car.captain_id = p_captain and car.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'car');
  end if;

  update public.captains
  set status = 'active', status_note = null, approved_at = now(), updated_at = now()
  where user_id = p_captain and status = 'review';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'decided');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.approve_captain_review(uuid, text[], text[], date, boolean) from public, anon, authenticated;
grant execute on function public.approve_captain_review(uuid, text[], text[], date, boolean) to service_role;
