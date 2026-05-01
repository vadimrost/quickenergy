-- Profiles table: mirrors auth.users in the public schema
create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Row-Level Security
alter table public.profiles enable row level security;

create policy "Eigenes Profil lesen"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Eigenes Profil aktualisieren"
  on public.profiles for update
  using (auth.uid() = id);

-- Trigger: legt automatisch ein Profil an, wenn ein neuer User sich registriert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
