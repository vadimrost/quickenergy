create table if not exists angebote (
  id uuid primary key default gen_random_uuid(),
  angebotsnummer text unique,
  status text not null default 'entwurf'
    check (status in ('entwurf', 'offen', 'berechnet', 'teilberechnet', 'abgelehnt')),
  kunde_id uuid references kunden(id) on delete set null,
  betreff text,
  angebotsdatum date not null default current_date,
  gueltig_bis date,
  referenz_bestellnr text,
  kopftext text default 'Sehr geehrte Damen und Herren,

herzlichen Dank für Ihre Anfrage. Es freut uns, Ihnen das gewünschte, unverbindliche Angebot unterbreiten zu dürfen.',
  fusstext text default 'Für etwaige Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.
Wir schätzen Ihr Vertrauen und bedanken uns herzlich dafür.

Mit freundlichen Grüßen,
Quick Energy',
  rabatt_gesamt_prozent numeric(5, 2) not null default 0,
  summe_netto_20 numeric(12, 2) not null default 0,
  summe_netto_10 numeric(12, 2) not null default 0,
  summe_netto_0  numeric(12, 2) not null default 0,
  ust_20         numeric(12, 2) not null default 0,
  ust_10         numeric(12, 2) not null default 0,
  summe_brutto   numeric(12, 2) not null default 0,
  -- set when converted to Auftragsbestätigung
  auftragsbestaetigung_id uuid,
  created_at timestamptz not null default now()
);

-- Auto-increment: AN-1108, AN-1109 ...
create sequence if not exists angebote_nr_seq start 1108;

create or replace function set_angebotsnummer()
returns trigger language plpgsql as $$
begin
  if new.angebotsnummer is null then
    new.angebotsnummer := 'AN-' || nextval('angebote_nr_seq')::text;
  end if;
  return new;
end;
$$;

create trigger trg_angebot_nr
  before insert on angebote
  for each row execute function set_angebotsnummer();

alter table angebote enable row level security;
create policy "auth users full access" on angebote for all using (auth.role() = 'authenticated');
