create table if not exists auftragsbestatigungen (
  id uuid primary key default gen_random_uuid(),
  ab_nummer text unique,
  status text not null default 'entwurf'
    check (status in ('entwurf', 'erhalten', 'teilberechnet', 'berechnet', 'abgelehnt', 'archiv')),
  kunde_id uuid references kunden(id) on delete set null,
  angebot_id uuid references angebote(id) on delete set null,
  betreff text,
  ab_datum date not null default current_date,
  -- §11 UStG: Leistungsdatum ist Pflicht auf der Rechnung, schon hier erfassen
  lieferdatum date,
  zahlungsziel_tage integer not null default 14,
  kopftext text default 'Sehr geehrte Damen und Herren,

vielen Dank für Ihren Auftrag. Wir bestätigen hiermit die Bestellung mit folgendem Inhalt:',
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
  created_at timestamptz not null default now()
);

-- Auto-increment: AB-1002, AB-1003 ... (AB-1001 already exists per screenshots)
create sequence if not exists auftragsbestatigungen_nr_seq start 1002;

create or replace function set_ab_nummer()
returns trigger language plpgsql as $$
begin
  if new.ab_nummer is null then
    new.ab_nummer := 'AB-' || nextval('auftragsbestatigungen_nr_seq')::text;
  end if;
  return new;
end;
$$;

create trigger trg_ab_nr
  before insert on auftragsbestatigungen
  for each row execute function set_ab_nummer();

alter table auftragsbestatigungen enable row level security;
create policy "auth users full access" on auftragsbestatigungen for all using (auth.role() = 'authenticated');
