-- Let captain_documents store the carpool papers the desk and the car app already name.
-- City kinds stay. Existing rows stay. The approval rules stay: carpool still needs
-- every mandatory kind, a future licence, RC, insurance and permit, and an active car.
-- The stored-kind list inside approve_captain_review is widened to match this check.
-- A kind that is not in the list is still rejected. Do not apply until a separate approval.
-- Do not apply to production from this phase.

do $$
declare
  constraint_name text;
begin
  -- PostgreSQL stores this check as "kind = ANY (ARRAY[...])", not "kind in".
  for constraint_name in
    select con.conname
    from pg_constraint as con
    join pg_class as rel on rel.oid = con.conrelid
    join pg_namespace as nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'captain_documents'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* '\mkind\M'
  loop
    execute format('alter table public.captain_documents drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.captain_documents
  add constraint captain_documents_kind_check
  check (kind in (
    'dlFront', 'dlBack', 'rc', 'aadhaar', 'pan', 'selfie',
    'insurance', 'permit', 'fitness', 'carFront', 'carBack', 'carInside'
  ));

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
  v_service text;
  v_vehicle text;
  v_today date;
  v_stored text[] := array['dlFront', 'dlBack', 'rc', 'aadhaar', 'pan', 'selfie', 'insurance', 'permit', 'fitness', 'carFront', 'carBack', 'carInside'];
  v_mandatory text[];
  v_expiring text[];
  v_need_car boolean;
  v_kind text;
  v_problem text;
  v_verified integer;
begin
  select captain.status, captain.service, captain.vehicle
  into v_status, v_service, v_vehicle
  from public.captains as captain
  where captain.user_id = p_captain
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing_captain');
  end if;

  if v_status is distinct from 'review' then
    return jsonb_build_object('ok', false, 'reason', 'decided');
  end if;

  if v_service in ('seats', 'carpool') then
    v_mandatory := array['dlFront', 'dlBack', 'aadhaar', 'selfie', 'rc', 'insurance', 'permit', 'carFront', 'carInside'];
    v_expiring := array['dlFront', 'rc', 'insurance', 'permit'];
    v_need_car := true;
  elsif v_service = 'taxi' and v_vehicle in ('bike', 'auto', 'cab') then
    v_mandatory := array['dlFront', 'dlBack', 'rc', 'aadhaar', 'pan', 'selfie'];
    v_expiring := array['dlFront', 'rc'];
    v_need_car := false;
  else
    return jsonb_build_object('ok', false, 'reason', 'unsupported_service');
  end if;

  -- A false car flag cannot skip the carpool car. A true flag cannot demand one from a city captain.
  if p_need_car and v_service in ('seats', 'carpool') then
    v_need_car := true;
  end if;

  -- India's current day. A caller date earlier than today must not make an expired document look valid.
  v_today := (timezone('Asia/Kolkata', now()))::date;
  if p_today is not null and p_today > v_today then
    v_today := p_today;
  end if;

  select mandatory_doc.mandatory_kind
  into v_kind
  from unnest(v_mandatory) with ordinality as mandatory_doc(mandatory_kind, doc_position)
  where not (mandatory_doc.mandatory_kind = any (v_stored))
  order by mandatory_doc.doc_position
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'reason', 'unsupported_document', 'kind', v_kind);
  end if;

  if p_required is null or coalesce(cardinality(p_required), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'incomplete_request');
  end if;

  if exists (
    select 1
    from unnest(v_mandatory) as mandatory_doc(mandatory_kind)
    where not exists (
      select 1
      from unnest(p_required) as requested_doc(requested_kind)
      where requested_doc.requested_kind = mandatory_doc.mandatory_kind
    )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'incomplete_request');
  end if;

  select requested_doc.requested_kind
  into v_kind
  from unnest(p_required) as requested_doc(requested_kind)
  where requested_doc.requested_kind is null
     or not (requested_doc.requested_kind = any (v_stored))
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'reason', 'unsupported_document', 'kind', v_kind);
  end if;

  -- Caller expiry kinds can add a date check. They cannot remove dlFront, rc, or a carpool date.
  select coalesce(array_agg(distinct listed.expiring_kind), array[]::text[])
  into v_expiring
  from (
    select base_expiring.expiring_kind
    from unnest(v_expiring) as base_expiring(expiring_kind)
    union
    select supplied_expiring.expiring_kind
    from unnest(coalesce(p_expiring, array[]::text[])) as supplied_expiring(expiring_kind)
    where supplied_expiring.expiring_kind = any (v_mandatory)
  ) as listed;

  select checked.problem_kind, checked.problem
  into v_kind, v_problem
  from (
    select
      mandatory_doc.mandatory_kind as problem_kind,
      mandatory_doc.doc_position,
      case
        when document_count.row_count = 0 then 'missing'
        when document_count.row_count > 1 then 'inconsistent'
        when document_row.doc_status = 'rejected' then 'rejected'
        when document_row.doc_status is distinct from 'verified' then 'missing'
        else 'ok'
      end as problem
    from unnest(v_mandatory) with ordinality as mandatory_doc(mandatory_kind, doc_position)
    left join lateral (
      select count(*)::integer as row_count
      from public.captain_documents as counted
      where counted.captain_id = p_captain
        and counted.kind = mandatory_doc.mandatory_kind
    ) as document_count on true
    left join lateral (
      select document.status as doc_status
      from public.captain_documents as document
      where document.captain_id = p_captain
        and document.kind = mandatory_doc.mandatory_kind
      order by document.updated_at desc
      limit 1
    ) as document_row on true
  ) as checked
  where checked.problem is distinct from 'ok'
  order by checked.doc_position
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'reason', v_problem, 'kind', v_kind);
  end if;

  select expiring_doc.expiring_kind
  into v_kind
  from unnest(v_expiring) with ordinality as expiring_doc(expiring_kind, doc_position)
  where expiring_doc.expiring_kind = any (v_mandatory)
    and exists (
      select 1
      from public.captain_documents as document
      where document.captain_id = p_captain
        and document.kind = expiring_doc.expiring_kind
        and document.status = 'verified'
        and (document.expires_on is null or document.expires_on <= v_today)
    )
  order by expiring_doc.doc_position
  limit 1;

  if found then
    if exists (
      select 1
      from public.captain_documents as document
      where document.captain_id = p_captain
        and document.kind = v_kind
        and document.expires_on is null
    ) then
      return jsonb_build_object('ok', false, 'reason', 'undated', 'kind', v_kind);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'expired', 'kind', v_kind);
  end if;

  select count(distinct document.kind)::integer
  into v_verified
  from public.captain_documents as document
  where document.captain_id = p_captain
    and document.kind = any (v_mandatory)
    and document.status = 'verified'
    and (
      not (document.kind = any (v_expiring))
      or (document.expires_on is not null and document.expires_on > v_today)
    );

  if v_verified is distinct from coalesce(cardinality(v_mandatory), 0) then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;

  if v_need_car and not exists (
    select 1
    from public.seat_cars as car
    where car.captain_id = p_captain
      and car.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'car');
  end if;

  update public.captains
  set status = 'active', status_note = null, approved_at = now(), updated_at = now()
  where user_id = p_captain
    and status = 'review';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'decided');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.approve_captain_review(uuid, text[], text[], date, boolean) from public, anon, authenticated;
grant execute on function public.approve_captain_review(uuid, text[], text[], date, boolean) to service_role;
