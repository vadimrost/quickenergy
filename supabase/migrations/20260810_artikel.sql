-- Artikel-Katalog (wiederverwendbare Positionen für Angebote/Rechnungen)
create table if not exists public.artikel (
  id          uuid primary key default gen_random_uuid(),
  nummer      text unique,
  bezeichnung text not null default '',
  gruppe      text,
  einheit     text not null default 'Stk',
  vk_netto    numeric not null default 0,
  ek_netto    numeric,
  bestand     numeric,
  created_at  timestamptz not null default now()
);

-- Fortlaufende Artikelnummer A-1001, A-1002, …
create sequence if not exists artikel_nr_seq start 1001;

create or replace function set_artikel_nummer() returns trigger as $$
begin
  if new.nummer is null then
    new.nummer := 'A-' || nextval('artikel_nr_seq')::text;
  end if;
  return new;
end;
$$ language plpgsql;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_set_artikel_nummer') then
    create trigger trg_set_artikel_nummer before insert on public.artikel
      for each row execute function set_artikel_nummer();
  end if;
end $$;

alter table public.artikel enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'artikel' and policyname = 'auth users full access') then
    create policy "auth users full access" on public.artikel
      for all using (auth.role() = 'authenticated');
  end if;
end $$;
