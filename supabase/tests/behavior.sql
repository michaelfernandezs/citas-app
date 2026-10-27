\set ON_ERROR_STOP on
begin;
set timezone='UTC';
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAILED: %', label; end if; end $$;
create function pg_temp.expect_error(sql text, expected text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then
    if sqlstate=expected then return; end if;
    raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm;
  end;
  raise exception 'Expected error %: %',expected,sql;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','admin@example.com','{"name":"Admin"}'),
 ('00000000-0000-0000-0000-000000000002','ana@example.com','{"name":"Ana", "role":"ADMIN"}'),
 ('00000000-0000-0000-0000-000000000003','bea@example.com','{"name":"Bea"}'),
 ('00000000-0000-0000-0000-000000000004','carlos@example.com','{"name":"Carlos"}');
update citas.profiles set role='ADMIN' where email='admin@example.com';
select pg_temp.assert_true((select role='PATIENT' from citas.profiles where email='ana@example.com'),'metadata cannot grant admin');
select pg_temp.assert_true(not has_function_privilege('anon','public.citas_api(text,jsonb)','execute'),'anonymous denied');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.citas_claim_emails()','execute'),'mail worker denied to patients');
select pg_temp.assert_true(not has_schema_privilege('authenticated','citas','usage'),'private schema denied');
select pg_temp.expect_error($q$select public.citas_api('mine')$q$,'PT401');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.citas_api('admin.config.save','{"minNoticeHours":0}');
select public.citas_api('admin.hours.create',jsonb_build_object('weekday',i,'startTime','09:00','endTime','12:00')) from generate_series(0,6) i;
select pg_temp.expect_error($q$select public.citas_api('admin.hours.create','{"weekday":1,"startTime":"12:00","endTime":"09:00"}')$q$,'PT400');
select pg_temp.expect_error($q$select public.citas_api('admin.config.save','{"slotDurationMinutes":0}')$q$,'PT400');
select pg_temp.expect_error($q$select public.citas_api('availability','{"from":"2026-01-01","to":"infinity"}')$q$,'PT400');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select public.citas_api('profile');
select pg_temp.expect_error($q$select public.citas_api('admin.appointments')$q$,'PT403');
reset role;
select pg_temp.assert_true(jsonb_array_length(public.citas_api('mine'))=0,'patient sees only own appointments');
select public.citas_api('book',jsonb_build_object('startsAt',date_trunc('day',now())+interval '1 day 9 hours')) as booking \gset
select pg_temp.expect_error(format('select public.citas_api(%L,%L::jsonb)','book',jsonb_build_object('startsAt',date_trunc('day',now())+interval '1 day 10 hours')),'PT409');
select pg_temp.expect_error(format('select public.citas_api(%L,%L::jsonb)','reschedule',jsonb_build_object('id',(:'booking'::jsonb)->>'id','startsAt',date_trunc('day',now())+interval '1 day 23 hours')),'PT409');
select pg_temp.assert_true((select count(*)=1 from citas.appointments where status='SCHEDULED'),'failed reschedule preserves original');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true(jsonb_array_length(public.citas_api('mine'))=0,'other patient cannot read booked patient');
select pg_temp.expect_error(format('select public.citas_api(%L,%L::jsonb)','cancel',jsonb_build_object('id',(:'booking'::jsonb)->>'id')),'PT404');
select public.citas_api('join',jsonb_build_object('appointmentId',(:'booking'::jsonb)->>'id')) as first_entry \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select public.citas_api('join',jsonb_build_object('appointmentId',(:'booking'::jsonb)->>'id')) as second_entry \gset
update citas.waitlist set "createdAt"=now()-interval '1 second' where id=((:'first_entry'::jsonb)->>'id')::uuid;
select pg_temp.assert_true((public.citas_api('waitlist')->>'position')::int=2,'FIFO position');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select public.citas_api('reschedule',jsonb_build_object('id',(:'booking'::jsonb)->>'id','startsAt',date_trunc('day',now())+interval '1 day 10 hours'));
select pg_temp.assert_true((select status='CANCELLED' from citas.appointments where id=((:'booking'::jsonb)->>'id')::uuid),'reschedule keeps history');
select pg_temp.assert_true((select count(*)=1 from citas.offers where status='PENDING'),'reschedule assigns waitlist');
select pg_temp.assert_true((select count(*)=1 from citas.email_outbox),'offer email queued transactionally');
select pg_temp.assert_true(jsonb_array_length(public.citas_api('availability',jsonb_build_object('from',date_trunc('day',now())+interval '1 day 9 hours','to',date_trunc('day',now())+interval '1 day 9 hours')))=0,'pending offer reserves slot');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true(public.citas_api('waitlist')->>'status'='OFFERED','first patient offered');
select public.citas_api('respond',jsonb_build_object('id',(:'first_entry'::jsonb)->>'id','accept',false));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select pg_temp.assert_true(public.citas_api('waitlist')->>'status'='OFFERED','rejection offers next patient');
select public.citas_api('respond',jsonb_build_object('id',(:'second_entry'::jsonb)->>'id','accept',true)) as accepted \gset
select pg_temp.assert_true((select count(*)=2 from citas.appointments where status='SCHEDULED'),'accepted offer creates appointment');
select pg_temp.assert_true((public.citas_api('waitlist')->>'inQueue')::boolean=false,'accepted entry leaves queue');
-- Nueva fila para comprobar el cron y el worker.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select public.citas_api('join',jsonb_build_object('appointmentId',(:'accepted'::jsonb)->>'id'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select public.citas_api('cancel',jsonb_build_object('id',(:'accepted'::jsonb)->>'id'));
select pg_temp.assert_true(jsonb_array_length(public.citas_claim_emails())=1,'worker ignores accepted/rejected stale mail');
select pg_temp.assert_true(jsonb_array_length(public.citas_claim_emails())=0,'worker leases prevent duplicate workers');
update citas.offers set "expiresAt"=now()-interval '1 second' where status='PENDING';
select citas.expire_offers();
select pg_temp.assert_true((select count(*)=0 from citas.offers where status='PENDING'),'cron expires overdue offers without browser');
select pg_temp.assert_true(jsonb_array_length(public.citas_api('availability',jsonb_build_object('from',date_trunc('day',now())+interval '1 day 9 hours','to',date_trunc('day',now())+interval '1 day 9 hours')))=1,'slot released after last offer expires');
-- Restricción de solapamiento independiente de la API.
select pg_temp.expect_error($q$insert into citas.appointments("patientId","startsAt","endsAt") values('00000000-0000-0000-0000-000000000003',date_trunc('day',now())+interval '1 day 10 hours 15 minutes',date_trunc('day',now())+interval '1 day 10 hours 45 minutes')$q$,'23P01');
select 'All behavior assertions passed' as result;
rollback;
