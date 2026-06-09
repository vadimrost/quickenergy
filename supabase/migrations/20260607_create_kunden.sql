create table if not exists kunden (
  id uuid primary key default gen_random_uuid(),
  kundennummer text unique,
  firmenname text,
  anrede text,
  vorname text,
  nachname text,
  adresse text,
  plz text,
  ort text,
  land text not null default 'Österreich',
  uid_nr text,
  email text,
  telefon text,
  notiz text,
  created_at timestamptz not null default now()
);

-- Auto-increment Kundennummer: K-1001, K-1002 ...
create sequence if not exists kunden_nr_seq start 1001;

create or replace function set_kundennummer()
returns trigger language plpgsql as $$
begin
  if new.kundennummer is null then
    new.kundennummer := 'K-' || nextval('kunden_nr_seq')::text;
  end if;
  return new;
end;
$$;

create trigger trg_kunden_nr
  before insert on kunden
  for each row execute function set_kundennummer();

alter table kunden enable row level security;
create policy "auth users full access" on kunden for all using (auth.role() = 'authenticated');
