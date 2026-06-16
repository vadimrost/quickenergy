-- Allow authenticated users to insert their own profile row.
-- The auth trigger (handle_new_user) handles initial creation,
-- but the upsert in useAuth.ts needs INSERT permission too.
create policy "Eigenes Profil erstellen"
  on public.profiles for insert
  with check (auth.uid() = id);
