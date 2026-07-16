-- Produktbilder pro Position + internes Bildarchiv
alter table public.dokument_positionen
  add column if not exists bild_url text;

create table if not exists public.bilder (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  url        text not null,
  created_at timestamptz not null default now()
);
alter table public.bilder enable row level security;
drop policy if exists "auth users full access" on public.bilder;
create policy "auth users full access" on public.bilder
  for all using (auth.role() = 'authenticated');
