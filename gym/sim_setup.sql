-- Bear Squad Gym: Sim Challenge progress saved per account.
-- One row per user. Only the signed-in owner can read or write their row.
create table if not exists public.gym_sim (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint gym_sim_state_size check (pg_column_size(state) < 20000)
);

alter table public.gym_sim enable row level security;

revoke all on public.gym_sim from anon;
revoke all on public.gym_sim from authenticated;
grant select, insert, update on public.gym_sim to authenticated;

drop policy if exists "sim own select" on public.gym_sim;
drop policy if exists "sim own insert" on public.gym_sim;
drop policy if exists "sim own update" on public.gym_sim;

create policy "sim own select" on public.gym_sim
  for select to authenticated using (auth.uid() = user_id);
create policy "sim own insert" on public.gym_sim
  for insert to authenticated with check (auth.uid() = user_id);
create policy "sim own update" on public.gym_sim
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

select 'gym_sim ready' as status;
