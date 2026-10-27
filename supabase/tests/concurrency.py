"""Integration test against the disposable local database only (never Supabase)."""
import concurrent.futures
import subprocess

PSQL = ['psql', '-h', '/tmp', '-p', '55432', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
USERS = ['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002']


def sql(statement, check=True):
    return subprocess.run(PSQL, input=statement, text=True, capture_output=True, check=check)


def book(user, hour):
    return sql(f"""begin; set timezone='UTC';
      select set_config('request.jwt.claim.sub','{user}',true);
      select pg_advisory_xact_lock(260001); select pg_sleep(0.5);
      select public.citas_api('book',jsonb_build_object('startsAt',date_trunc('day',now())+interval '1 day {hour} hours'));
      commit;""", check=False)


def race(requests):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda args: book(*args), requests))
    assert sum(r.returncode == 0 for r in results) == 1, [(r.returncode, r.stderr) for r in results]
    assert 'Solo puedes tener' in ''.join(r.stderr for r in results) or 'ya no est' in ''.join(r.stderr for r in results)


sql("""do $$begin
  if exists(select 1 from auth.users) then raise exception 'Use an empty disposable LOCAL test DB'; end if;
end $$;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','race1@example.com'),
 ('10000000-0000-0000-0000-000000000002','race2@example.com');
insert into citas.hours(weekday,"startMinute","endMinute") select i,540,720 from generate_series(0,6) i;
update citas.config set "minNoticeHours"=0;""")
try:
    race([(USERS[0], 9), (USERS[1], 9)])
    assert sql('select count(*) from citas.appointments;').stdout.strip() == '1'
    print('PASS: two patients competing for one slot produce exactly one booking')
    sql('delete from citas.appointments;')
    race([(USERS[0], 9), (USERS[0], 10)])
    assert sql('select count(*) from citas.appointments;').stdout.strip() == '1'
    print('PASS: concurrent bookings by one patient produce exactly one active appointment')
finally:
    sql('delete from citas.appointments; delete from auth.users; delete from citas.hours; update citas.config set "minNoticeHours"=2;')
