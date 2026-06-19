-- Rollen-System: admin = Philipp/Granit, setter = Vertrieb
alter table public.profiles
  add column if not exists rolle text not null default 'admin'
    check (rolle in ('admin', 'setter')),
  add column if not exists setter_name text;

-- Alle eingeloggten User dürfen alle Profile lesen (interne App)
drop policy if exists "Eigenes Profil lesen" on public.profiles;
create policy "Authentifiziert lesen"
  on public.profiles for select
  using (auth.uid() is not null);

-- Alle eingeloggten User dürfen Profile aktualisieren (Admin-Verwaltung)
drop policy if exists "Eigenes Profil aktualisieren" on public.profiles;
create policy "Authentifiziert aktualisieren"
  on public.profiles for update
  using (auth.uid() is not null);
