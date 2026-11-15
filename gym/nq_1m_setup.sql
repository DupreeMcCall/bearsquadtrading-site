-- Bear Squad: permanent library of real 1-minute NQ candles (5:00-9:00am PT) for The Gym.
-- Public market data. Read-only for the site; only the database itself writes (pg_cron + pg_net).
create table if not exists public.nq_1m(
  t bigint primary key,          -- unix seconds (minute start)
  d date not null,               -- trading date, Pacific
  mm smallint not null,          -- minute of day, Pacific (390 = 6:30am)
  o numeric(10,2) not null, h numeric(10,2) not null, l numeric(10,2) not null, c numeric(10,2) not null,
  v bigint not null default 0);
create index if not exists nq_1m_d on public.nq_1m(d);
alter table public.nq_1m enable row level security;
drop policy if exists "nq_1m public read" on public.nq_1m;
create policy "nq_1m public read" on public.nq_1m for select to anon, authenticated using (true);
revoke insert, update, delete on public.nq_1m from anon, authenticated;
grant select on public.nq_1m to anon, authenticated;

create table if not exists public.nq_1m_req(id bigint primary key, created_at timestamptz not null default now());
alter table public.nq_1m_req enable row level security;
revoke all on public.nq_1m_req from anon, authenticated;

-- Fire: ask Yahoo for 1-minute NQ candles in 7-day chunks (Yahoo keeps ~30 days of 1m data).
create or replace function public.nq_1m_fire(days_back int default 7) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; p2 bigint := extract(epoch from now())::bigint; p1 bigint; rid bigint;
begin
  while n * 7 < days_back loop
    p1 := p2 - 7 * 86400;
    select net.http_get(
      url := format('https://query1.finance.yahoo.com/v8/finance/chart/NQ%%3DF?interval=1m&period1=%s&period2=%s', p1, p2),
      headers := '{"User-Agent":"Mozilla/5.0"}'::jsonb,
      timeout_milliseconds := 20000) into rid;
    insert into public.nq_1m_req(id) values (rid) on conflict do nothing;
    p2 := p1; n := n + 1;
  end loop;
  return n;
end $$;

-- Flush: store the morning window (5:00-9:00am PT) from any finished responses.
create or replace function public.nq_1m_flush() returns int
language plpgsql security definer set search_path = public as $$
declare r record; j jsonb; ts jsonb; q jsonb; i int; n int := 0; tsec bigint; lt timestamp; mn int;
begin
  for r in select x.id, x.status_code, x.content from net._http_response x join public.nq_1m_req k on k.id = x.id loop
    if r.status_code = 200 then
      j := r.content::jsonb -> 'chart' -> 'result' -> 0;
      ts := j -> 'timestamp'; q := j -> 'indicators' -> 'quote' -> 0;
      if ts is not null and jsonb_typeof(ts) = 'array' then
        for i in 0 .. jsonb_array_length(ts) - 1 loop
          tsec := (ts ->> i)::bigint;
          lt := to_timestamp(tsec) at time zone 'America/Los_Angeles';
          mn := extract(hour from lt)::int * 60 + extract(minute from lt)::int;
          if mn between 300 and 540
             and q -> 'open' ->> i is not null and q -> 'high' ->> i is not null
             and q -> 'low' ->> i is not null and q -> 'close' ->> i is not null then
            insert into public.nq_1m (t, d, mm, o, h, l, c, v) values (tsec, lt::date, mn,
              round((q -> 'open' ->> i)::numeric, 2), round((q -> 'high' ->> i)::numeric, 2),
              round((q -> 'low' ->> i)::numeric, 2), round((q -> 'close' ->> i)::numeric, 2),
              coalesce((q -> 'volume' ->> i)::numeric, 0)::bigint)
            on conflict (t) do nothing;
            n := n + 1;
          end if;
        end loop;
      end if;
    end if;
    delete from public.nq_1m_req where id = r.id;
  end loop;
  delete from public.nq_1m_req where created_at < now() - interval '1 day';
  return n;
end $$;

revoke execute on function public.nq_1m_fire(int) from public, anon, authenticated;
revoke execute on function public.nq_1m_flush() from public, anon, authenticated;

-- Every weekday after the close: 2:20pm PST (22:20 UTC), store 5 minutes later.
select cron.unschedule(jobid) from cron.job where jobname in ('nq1m-fire','nq1m-flush');
select cron.schedule('nq1m-fire',  '20 22 * * 1-5', 'select public.nq_1m_fire(7)');
select cron.schedule('nq1m-flush', '25,40 22 * * 1-5', 'select public.nq_1m_flush()');

-- Backfill: everything Yahoo still has (~30 days).
select public.nq_1m_fire(35) as requests_sent;
