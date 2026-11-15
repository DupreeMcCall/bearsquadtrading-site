-- Bear Squad Wish List: ideas from signed-in users.
-- Private: each user can only see and add their own ideas. Review happens in the dashboard.
create table if not exists public.wishlist (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text check (char_length(name) <= 40),
  category text not null check (category in ('tool','improvement','data','bug','other')),
  idea text not null check (char_length(idea) between 8 and 600),
  use_freq text check (use_freq in ('daily','weekly','sometimes')),
  page text check (char_length(page) <= 40),
  status text not null default 'new' check (status in ('new','reviewing','planned','shipped','not_now')),
  created_at timestamptz not null default now()
);

alter table public.wishlist enable row level security;

revoke all on public.wishlist from anon;
revoke all on public.wishlist from authenticated;
grant select on public.wishlist to authenticated;
grant insert (name, category, idea, use_freq, page) on public.wishlist to authenticated;

drop policy if exists "wish own select" on public.wishlist;
drop policy if exists "wish own insert" on public.wishlist;
create policy "wish own select" on public.wishlist
  for select to authenticated using (auth.uid() = user_id);
create policy "wish own insert" on public.wishlist
  for insert to authenticated with check (auth.uid() = user_id);

-- simple anti-spam: max 10 ideas per user per day
create or replace function public.wishlist_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.wishlist where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Daily limit reached. Thanks for all the ideas! Try again tomorrow.';
  end if;
  return new;
end $$;
revoke execute on function public.wishlist_limit() from public;
drop trigger if exists wishlist_limit on public.wishlist;
create trigger wishlist_limit before insert on public.wishlist for each row execute function public.wishlist_limit();

select 'wishlist ready' as status;
