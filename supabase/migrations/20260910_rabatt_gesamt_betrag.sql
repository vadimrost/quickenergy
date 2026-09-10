-- Gesamtrabatt kann jetzt auch als fester Euro-Betrag erfasst werden.
-- Konvention: es ist immer nur eines der beiden Felder gesetzt —
-- rabatt_gesamt_prozent > 0  ODER  rabatt_gesamt_betrag > 0.
alter table public.angebote
  add column if not exists rabatt_gesamt_betrag numeric(12, 2) not null default 0;

alter table public.auftragsbestatigungen
  add column if not exists rabatt_gesamt_betrag numeric(12, 2) not null default 0;

alter table public.ausgangsrechnungen
  add column if not exists rabatt_gesamt_betrag numeric(12, 2) not null default 0;

alter table public.dokument_vorlagen
  add column if not exists rabatt_gesamt_betrag numeric(12, 2) not null default 0;
