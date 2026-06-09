create table if not exists ausgangsrechnungen (
  id uuid primary key default gen_random_uuid(),
  -- §11 UStG: fortlaufende Nummer, KEINE Lücken erlaubt
  rechnungsnummer text unique,
  status text not null default 'entwurf'
    check (status in ('entwurf', 'offen', 'teilbezahlt', 'bezahlt', 'storniert')),
  typ text not null default 'rechnung'
    check (typ in ('rechnung', 'teilrechnung', 'schlussrechnung', 'stornorechnung')),
  kunde_id uuid references kunden(id) on delete set null,
  auftragsbestaetigung_id uuid references auftragsbestatigungen(id) on delete set null,
  -- set only for Stornorechnung: points to the invoice being cancelled
  storno_zu_rechnung_id uuid references ausgangsrechnungen(id) on delete set null,
  betreff text,
  rechnungsdatum date not null default current_date,
  -- §11 UStG Pflicht: Leistungsdatum oder -zeitraum muss angegeben werden
  leistungsdatum date,
  leistungszeitraum_von date,
  leistungszeitraum_bis date,
  zahlungsziel_tage integer not null default 14,
  faelligkeitsdatum date,
  -- for Teilrechnung: percentage of total order (e.g. 30 = "30% Teilrechnung")
  teilrechnungs_prozent numeric(5, 2),
  kopftext text default 'Sehr geehrte Damen und Herren,

vielen Dank für Ihren Auftrag und das damit verbundene Vertrauen!
Hiermit stelle ich Ihnen die folgenden Leistungen in Rechnung:',
  fusstext text default 'Bitte überweisen Sie nach Erhalt den Rechnungsbetrag unter Angabe Ihrer Rechnungsnummer auf unser Konto bei der Erste Bank:

Empfänger: Quick Energy Handels GmbH
IBAN: AT62 2011 1290 2612 2005',
  rabatt_gesamt_prozent numeric(5, 2) not null default 0,
  summe_netto_20 numeric(12, 2) not null default 0,
  summe_netto_10 numeric(12, 2) not null default 0,
  summe_netto_0  numeric(12, 2) not null default 0,
  ust_20         numeric(12, 2) not null default 0,
  ust_10         numeric(12, 2) not null default 0,
  summe_brutto   numeric(12, 2) not null default 0,
  bezahlt_am date,
  bezahlt_betrag numeric(12, 2),
  datev_exportiert_am timestamptz,
  created_at timestamptz not null default now()
);

-- Auto-increment: RE-10025096, RE-10025097 ...
-- Starting after RE-10025094 (last seen in screenshots) + buffer
create sequence if not exists ausgangsrechnungen_nr_seq start 10025096;

create or replace function set_rechnungsnummer()
returns trigger language plpgsql as $$
begin
  if new.rechnungsnummer is null then
    new.rechnungsnummer := 'RE-' || nextval('ausgangsrechnungen_nr_seq')::text;
  end if;
  -- auto-calculate Fälligkeitsdatum
  if new.faelligkeitsdatum is null and new.rechnungsdatum is not null then
    new.faelligkeitsdatum := new.rechnungsdatum + new.zahlungsziel_tage;
  end if;
  return new;
end;
$$;

create trigger trg_rechnung_nr
  before insert on ausgangsrechnungen
  for each row execute function set_rechnungsnummer();

alter table ausgangsrechnungen enable row level security;
create policy "auth users full access" on ausgangsrechnungen for all using (auth.role() = 'authenticated');
