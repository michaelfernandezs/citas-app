-- Backend transaccional. Las tablas privadas no se exponen por PostgREST.
create schema if not exists citas;
revoke all on schema citas from public, anon, authenticated;

create table citas.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null, name text not null, phone text,
  role text not null default 'PATIENT' check (role in ('PATIENT','ADMIN')),
  "createdAt" timestamptz not null default now()
);
create table citas.hours (
  id uuid primary key default gen_random_uuid(), weekday integer unique not null check (weekday between 0 and 6),
  "startMinute" integer not null check ("startMinute" between 0 and 1439),
  "endMinute" integer not null check ("endMinute" between 1 and 1440),
  check ("startMinute" < "endMinute")
);
create table citas.exceptions (
  id uuid primary key default gen_random_uuid(), date date unique not null,
  "isClosed" boolean not null, "startMinute" integer, "endMinute" integer,
  check ("isClosed" or ("startMinute" is not null and "endMinute" is not null
    and "startMinute" >= 0 and "endMinute" <= 1440 and "startMinute" < "endMinute"))
);
create table citas.config (
  id text primary key default 'singleton' check (id = 'singleton'),
  "slotDurationMinutes" integer not null default 30 check ("slotDurationMinutes" between 5 and 1440),
  "bufferMinutes" integer not null default 0 check ("bufferMinutes" between 0 and 1440),
  "minNoticeHours" integer not null default 2 check ("minNoticeHours" between 0 and 8760),
  "maxAdvanceDays" integer not null default 30 check ("maxAdvanceDays" between 1 and 366),
  timezone text not null default 'UTC' -- conserva las horas del backend anterior; ver README
);
insert into citas.config default values;
create table citas.appointments (
  id uuid primary key default gen_random_uuid(), "patientId" uuid not null references citas.profiles,
  "startsAt" timestamptz not null, "endsAt" timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','CANCELLED','COMPLETED')),
  "createdAt" timestamptz not null default now(), "cancelledAt" timestamptz,
  check ("startsAt" < "endsAt")
);
create unique index one_appointment_per_patient on citas.appointments ("patientId") where status='SCHEDULED';
-- Protección adicional aun para escrituras administrativas fuera de la API.
alter table citas.appointments add constraint no_overlap exclude using gist
  (tstzrange("startsAt", "endsAt", '[)') with &&) where (status='SCHEDULED');
create table citas.waitlist (
  id uuid primary key default gen_random_uuid(), "patientId" uuid not null references citas.profiles,
  "watchedAppointmentId" uuid not null references citas.appointments,
  status text not null default 'WAITING' check (status in ('WAITING','OFFERED','ACCEPTED','EXPIRED','REJECTED','CANCELLED_BY_PATIENT')),
  "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now()
);
create unique index one_active_queue_per_patient on citas.waitlist ("patientId") where status in ('WAITING','OFFERED');
create index queue_order on citas.waitlist ("watchedAppointmentId", status, "createdAt", id);
create table citas.offers (
  id uuid primary key default gen_random_uuid(), "waitlistEntryId" uuid not null unique references citas.waitlist,
  "startsAt" timestamptz not null, "endsAt" timestamptz not null, "expiresAt" timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','EXPIRED','REJECTED')),
  "createdAt" timestamptz not null default now()
);
create table citas.email_outbox (
  id uuid primary key default gen_random_uuid(), "offerId" uuid not null unique references citas.offers,
  recipient text not null, "startsAt" timestamptz not null, "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(), "sentAt" timestamptz,
  "claimedAt" timestamptz, attempts integer not null default 0
);
-- Defensa adicional: incluso si se expone el esquema por accidente, no hay políticas de acceso.
alter table citas.profiles enable row level security;
alter table citas.hours enable row level security;
alter table citas.exceptions enable row level security;
alter table citas.config enable row level security;
alter table citas.appointments enable row level security;
alter table citas.waitlist enable row level security;
alter table citas.offers enable row level security;
alter table citas.email_outbox enable row level security;

create function citas.new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into citas.profiles(id,email,name,phone)
  values(new.id, new.email, left(coalesce(nullif(new.raw_user_meta_data->>'name',''),split_part(new.email,'@',1)),200),
    left(new.raw_user_meta_data->>'phone',50));
  return new;
end $$;
create trigger citas_new_user after insert on auth.users for each row execute function citas.new_user();
-- También permite instalar la migración si ya se creó una cuenta en Supabase.
insert into citas.profiles(id,email,name,phone)
select id,email,left(coalesce(nullif(raw_user_meta_data->>'name',''),split_part(email,'@',1)),200),
  left(raw_user_meta_data->>'phone',50) from auth.users where email is not null
on conflict(id) do nothing;

create function citas.minutes(value text) returns integer language plpgsql immutable set search_path='' as $$
begin
  if value is null or value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode='PT400',message='La hora debe tener formato HH:mm';
  end if;
  return split_part(value,':',1)::int*60+split_part(value,':',2)::int;
end $$;

create function citas.availability(range_from timestamptz, range_to timestamptz)
returns table("startsAt" timestamptz,"endsAt" timestamptz) language plpgsql set search_path='' as $$
declare c citas.config; d date; lo integer; hi integer; m integer; s timestamptz; e timestamptz; x citas.exceptions;
begin
  if range_from is null or range_to is null or not isfinite(range_from) or not isfinite(range_to)
    or range_to < range_from or range_to-range_from > interval '367 days' then
    raise exception using errcode='PT400',message='Rango de fechas inválido (máximo 367 días)';
  end if;
  select * into c from citas.config;
  for d in select generate_series((greatest(range_from,now()) at time zone c.timezone)::date,
      (least(range_to,now()+make_interval(days=>c."maxAdvanceDays")) at time zone c.timezone)::date,interval '1 day')::date loop
    select * into x from citas.exceptions where date=d;
    if found then
      if x."isClosed" then continue; end if;
      lo:=x."startMinute"; hi:=x."endMinute";
    else
      select "startMinute","endMinute" into lo,hi from citas.hours where weekday=extract(dow from d)::int;
      if not found then continue; end if;
    end if;
    m:=lo;
    while m+c."slotDurationMinutes" <= hi loop
      s := (d::timestamp+make_interval(mins=>m)) at time zone c.timezone;
      e := s+make_interval(mins=>c."slotDurationMinutes");
      if s>=range_from and s<=range_to and s>=now()+make_interval(hours=>c."minNoticeHours")
        and s<=now()+make_interval(days=>c."maxAdvanceDays")
        and not exists(select 1 from citas.appointments a where a.status='SCHEDULED' and a."startsAt"<e and a."endsAt">s)
        and not exists(select 1 from citas.offers o where o.status='PENDING' and o."expiresAt">now() and o."startsAt"<e and o."endsAt">s) then
        "startsAt":=s; "endsAt":=e; return next;
      end if;
      m:=m+c."slotDurationMinutes"+c."bufferMinutes";
    end loop;
  end loop;
end $$;

-- Solo se llama con el bloqueo transaccional de agenda adquirido.
create function citas.assign_next(appointment_id uuid) returns void language plpgsql set search_path='' as $$
#variable_conflict use_column
declare a citas.appointments; w citas.waitlist; o citas.offers;
begin
  select * into a from citas.appointments where id=appointment_id;
  if a.status<>'CANCELLED' then return; end if;
  if a."startsAt"<=now() or exists(select 1 from citas.appointments where status='SCHEDULED'
    and "startsAt"<a."endsAt" and "endsAt">a."startsAt") then
    update citas.waitlist set status='EXPIRED',"updatedAt"=now() where "watchedAppointmentId"=a.id and status='WAITING';
    return;
  end if;
  if exists(select 1 from citas.offers o join citas.waitlist w on w.id=o."waitlistEntryId"
    where w."watchedAppointmentId"=a.id and o.status='PENDING') then return; end if;
  select * into w from citas.waitlist where "watchedAppointmentId"=a.id and status='WAITING' order by "createdAt",id limit 1;
  if not found then return; end if;
  update citas.waitlist set status='OFFERED',"updatedAt"=now() where id=w.id;
  insert into citas.offers("waitlistEntryId","startsAt","endsAt","expiresAt")
    values(w.id,a."startsAt",a."endsAt",least(now()+interval '3 hours',a."startsAt")) returning * into o;
  insert into citas.email_outbox("offerId",recipient,"startsAt","expiresAt")
    select o.id,email,o."startsAt",o."expiresAt" from citas.profiles where id=w."patientId";
end $$;

create function citas.expire_offers() returns void language plpgsql set search_path='' as $$
declare r record;
begin
  perform pg_advisory_xact_lock(260001);
  for r in select o.id,w.id as entry,w."watchedAppointmentId" as appointment
    from citas.offers o join citas.waitlist w on w.id=o."waitlistEntryId"
    where o.status='PENDING' and o."expiresAt"<=now() loop
    update citas.offers set status='EXPIRED' where id=r.id;
    update citas.waitlist set status='EXPIRED',"updatedAt"=now() where id=r.entry;
    perform citas.assign_next(r.appointment);
  end loop;
end $$;

-- Una sola entrada autenticada; identidad/rol se leen en servidor, nunca del payload.
create function public.citas_api(action text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare uid uuid:=auth.uid(); admin boolean; result jsonb; a citas.appointments; w citas.waitlist;
  o citas.offers; c citas.config; start_at timestamptz; end_at timestamptz;
  entry_id uuid; old_id uuid; from_at timestamptz; to_at timestamptz;
begin
  if uid is null then raise exception using errcode='PT401',message='Inicia sesión'; end if;
  select role='ADMIN' into admin from citas.profiles where id=uid;
  if not found then raise exception using errcode='PT403',message='Perfil no encontrado'; end if;
  if action like 'admin.%' and not admin then raise exception using errcode='PT403',message='Acceso solo para administradores'; end if;
  if action='profile' then
    select to_jsonb(p) into result from citas.profiles p where id=uid;
    return result;
  end if;
  -- Serializa cambios de agenda y ofertas, incluidos cron y reprogramaciones.
  perform pg_advisory_xact_lock(260001);
  perform citas.expire_offers();
  case action
  when 'availability' then
    select coalesce(jsonb_agg(to_jsonb(s) order by s."startsAt"),'[]') into result
      from citas.availability((payload->>'from')::timestamptz,(payload->>'to')::timestamptz) s;
  when 'mine' then
    select coalesce(jsonb_agg(to_jsonb(a) order by a."startsAt"),'[]') into result from citas.appointments a where a."patientId"=uid;
  when 'booked' then
    from_at:=(payload->>'from')::timestamptz; to_at:=(payload->>'to')::timestamptz;
    if from_at is null or to_at is null or not isfinite(from_at) or not isfinite(to_at) or to_at<from_at or to_at-from_at>interval '367 days' then
      raise exception using errcode='PT400',message='Rango de fechas inválido'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'startsAt',a."startsAt",'endsAt',a."endsAt") order by a."startsAt"),'[]')
      into result from citas.appointments a where a.status='SCHEDULED' and a."patientId"<>uid and a."startsAt" between from_at and to_at;
  when 'book','reschedule' then
    if action='reschedule' then
      select * into a from citas.appointments where id=(payload->>'id')::uuid and "patientId"=uid;
      if not found then raise exception using errcode='PT404',message='La cita no existe'; end if;
      if a.status<>'SCHEDULED' or a."startsAt"<=now() then raise exception using errcode='PT400',message='Solo puedes reprogramar citas confirmadas futuras'; end if;
      old_id:=a.id;
    elsif exists(select 1 from citas.appointments where "patientId"=uid and status='SCHEDULED') then
      raise exception using errcode='PT409',message='Solo puedes tener una cita confirmada a la vez';
    end if;
    start_at:=(payload->>'startsAt')::timestamptz;
    select s."endsAt" into end_at from citas.availability(start_at,start_at) s where s."startsAt"=start_at;
    if not found then raise exception using errcode='PT409',message='Ese horario ya no está disponible'; end if;
    if old_id is not null then update citas.appointments set status='CANCELLED',"cancelledAt"=now() where id=old_id; end if;
    insert into citas.appointments("patientId","startsAt","endsAt") values(uid,start_at,end_at) returning to_jsonb(appointments.*) into result;
    if old_id is not null then perform citas.assign_next(old_id); end if;
  when 'cancel','admin.cancel' then
    select * into a from citas.appointments where id=(payload->>'id')::uuid and (action='admin.cancel' or "patientId"=uid);
    if not found then raise exception using errcode='PT404',message='La cita no existe'; end if;
    if a.status<>'SCHEDULED' then raise exception using errcode='PT400',message='Solo puedes cancelar citas confirmadas'; end if;
    update citas.appointments set status='CANCELLED',"cancelledAt"=now() where id=a.id returning to_jsonb(appointments.*) into result;
    perform citas.assign_next(a.id);
  when 'admin.appointments' then
    select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('patient',jsonb_build_object('id',p.id,'name',p.name,'email',p.email)) order by a."startsAt"),'[]')
      into result from citas.appointments a join citas.profiles p on p.id=a."patientId";
  when 'join' then
    if exists(select 1 from citas.waitlist where "patientId"=uid and status in ('WAITING','OFFERED')) then raise exception using errcode='PT409',message='Ya tienes un lugar activo en la fila'; end if;
    select * into a from citas.appointments where id=(payload->>'appointmentId')::uuid;
    if not found then raise exception using errcode='PT404',message='Esa cita no existe'; end if;
    if a.status<>'SCHEDULED' or a."startsAt"<=now() or a."patientId"=uid then raise exception using errcode='PT400',message='Solo puedes esperar una cita futura ocupada por otro paciente'; end if;
    insert into citas.waitlist("patientId","watchedAppointmentId") values(uid,a.id) returning to_jsonb(waitlist.*) into result;
  when 'leave' then
    update citas.waitlist set status='CANCELLED_BY_PATIENT',"updatedAt"=now() where id=(payload->>'id')::uuid and "patientId"=uid and status='WAITING' returning to_jsonb(waitlist.*) into result;
    if not found then raise exception using errcode='PT400',message='No tienes un lugar en espera con ese identificador'; end if;
  when 'waitlist' then
    select * into w from citas.waitlist where "patientId"=uid and status in ('WAITING','OFFERED');
    if not found then return jsonb_build_object('inQueue',false); end if;
    select * into a from citas.appointments where id=w."watchedAppointmentId";
    select * into o from citas.offers where "waitlistEntryId"=w.id;
    result:=jsonb_build_object('inQueue',true,'status',w.status,'entry',to_jsonb(w)||jsonb_build_object('watchedAppointment',jsonb_build_object('id',a.id,'startsAt',a."startsAt",'endsAt',a."endsAt")));
    if w.status='OFFERED' then result:=result||jsonb_build_object('offer',to_jsonb(o));
    else result:=result||jsonb_build_object('position',1+(select count(*) from citas.waitlist where "watchedAppointmentId"=w."watchedAppointmentId" and status='WAITING' and ("createdAt",id)<(w."createdAt",w.id))); end if;
  when 'respond' then
    select * into w from citas.waitlist where id=(payload->>'id')::uuid and "patientId"=uid and status='OFFERED';
    if not found then raise exception using errcode='PT400',message='No tienes una oferta activa'; end if;
    select * into o from citas.offers where "waitlistEntryId"=w.id and status='PENDING' and "expiresAt">now();
    if not found then raise exception using errcode='PT400',message='La oferta ya expiró'; end if;
    if jsonb_typeof(payload->'accept') is distinct from 'boolean' then raise exception using errcode='PT400',message='Indica si aceptas la oferta'; end if;
    if (payload->>'accept')::boolean then
      if exists(select 1 from citas.appointments where "patientId"=uid and status='SCHEDULED') then raise exception using errcode='PT409',message='Solo puedes tener una cita confirmada a la vez'; end if;
      if exists(select 1 from citas.appointments where status='SCHEDULED' and "startsAt"<o."endsAt" and "endsAt">o."startsAt") then raise exception using errcode='PT409',message='Ese espacio ya fue tomado'; end if;
      update citas.offers set status='ACCEPTED' where id=o.id;
      update citas.waitlist set status='ACCEPTED',"updatedAt"=now() where id=w.id;
      insert into citas.appointments("patientId","startsAt","endsAt") values(uid,o."startsAt",o."endsAt") returning to_jsonb(appointments.*) into result;
      update citas.waitlist set status='EXPIRED',"updatedAt"=now() where "watchedAppointmentId"=w."watchedAppointmentId" and status='WAITING';
    else
      update citas.offers set status='REJECTED' where id=o.id;
      update citas.waitlist set status='REJECTED',"updatedAt"=now() where id=w.id;
      perform citas.assign_next(w."watchedAppointmentId");
      result:='{}';
    end if;
  when 'admin.hours' then select coalesce(jsonb_agg(to_jsonb(h) order by weekday),'[]') into result from citas.hours h;
  when 'admin.hours.create' then
    insert into citas.hours(weekday,"startMinute","endMinute") values((payload->>'weekday')::int,citas.minutes(payload->>'startTime'),citas.minutes(payload->>'endTime')) returning to_jsonb(hours.*) into result;
  when 'admin.hours.delete' then delete from citas.hours where id=(payload->>'id')::uuid returning to_jsonb(hours.*) into result;
  when 'admin.exceptions' then select coalesce(jsonb_agg(to_jsonb(e) order by date),'[]') into result from citas.exceptions e;
  when 'admin.exceptions.save' then
    insert into citas.exceptions(date,"isClosed","startMinute","endMinute") values((payload->>'date')::date,(payload->>'isClosed')::boolean,
      case when not (payload->>'isClosed')::boolean then citas.minutes(payload->>'startTime') end,
      case when not (payload->>'isClosed')::boolean then citas.minutes(payload->>'endTime') end)
    on conflict(date) do update set "isClosed"=excluded."isClosed","startMinute"=excluded."startMinute","endMinute"=excluded."endMinute" returning to_jsonb(exceptions.*) into result;
  when 'admin.exceptions.delete' then delete from citas.exceptions where id=(payload->>'id')::uuid returning to_jsonb(exceptions.*) into result;
  when 'admin.config' then select to_jsonb(c) into result from citas.config c;
  when 'admin.config.save' then
    update citas.config set "slotDurationMinutes"=coalesce((payload->>'slotDurationMinutes')::int,"slotDurationMinutes"),
      "bufferMinutes"=coalesce((payload->>'bufferMinutes')::int,"bufferMinutes"),
      "minNoticeHours"=coalesce((payload->>'minNoticeHours')::int,"minNoticeHours"),
      "maxAdvanceDays"=coalesce((payload->>'maxAdvanceDays')::int,"maxAdvanceDays") returning to_jsonb(config.*) into result;
  else raise exception using errcode='PT404',message='Operación desconocida';
  end case;
  return coalesce(result,'null'::jsonb);
exception
  when unique_violation or exclusion_violation then raise exception using errcode='PT409',message='El horario, cita o lugar en la fila ya existe. Actualiza e intenta de nuevo.';
  when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    raise exception using errcode='PT400',message='Los datos enviados no son válidos';
end $$;

revoke all on all tables in schema citas from public,anon,authenticated;
revoke all on all functions in schema citas from public,anon,authenticated;
revoke all on function public.citas_api(text,jsonb) from public,anon;
grant execute on function public.citas_api(text,jsonb) to authenticated;
