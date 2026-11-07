begin;

create table if not exists public.products (
  id text primary key check (id ~ '^[a-f0-9]{24}$'),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.admin_sessions (
  token text primary key,
  expires bigint not null
);
create table if not exists public.admin_login_attempts (
  key text primary key,
  count integer not null,
  until bigint not null
);

alter table public.products enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_login_attempts enable row level security;
revoke all on public.products, public.admin_sessions, public.admin_login_attempts from anon, authenticated;
grant all on public.products, public.admin_sessions, public.admin_login_attempts to service_role;

create or replace function public.allow_admin_login(client_key text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  timestamp_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  attempt_count integer;
begin
  delete from public.admin_sessions where expires < timestamp_ms;
  delete from public.admin_login_attempts where until < timestamp_ms;
  insert into public.admin_login_attempts(key, count, until)
    values (client_key, 1, timestamp_ms + 600000)
    on conflict (key) do update set count = public.admin_login_attempts.count + 1
    returning count into attempt_count;
  return attempt_count <= 10;
end;
$$;
revoke all on function public.allow_admin_login(text) from public, anon, authenticated;
grant execute on function public.allow_admin_login(text) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2000000,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

commit;
