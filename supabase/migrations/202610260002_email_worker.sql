-- El worker solo se invoca con service_role desde una Edge Function.
create function public.citas_claim_emails() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  with candidates as (
    select e.id from citas.email_outbox e join citas.offers o on o.id=e."offerId"
    where e."sentAt" is null and e.attempts<10 and o.status='PENDING' and o."expiresAt">now()
      and (e."claimedAt" is null or e."claimedAt"<now()-interval '5 minutes')
    order by e."createdAt" limit 5 for update of e skip locked
  ), claimed as (
    update citas.email_outbox e set "claimedAt"=now(),attempts=attempts+1
      from candidates c where e.id=c.id returning e.*
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
  return result;
end $$;
create function public.citas_ack_email(email_id uuid) returns void language sql security definer set search_path='' as $$
  update citas.email_outbox set "sentAt"=now() where id=email_id and "sentAt" is null;
$$;
revoke all on function public.citas_claim_emails() from public,anon,authenticated;
revoke all on function public.citas_ack_email(uuid) from public,anon,authenticated;
grant execute on function public.citas_claim_emails() to service_role;
grant execute on function public.citas_ack_email(uuid) to service_role;
