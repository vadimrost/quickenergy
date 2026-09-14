-- Ansprechpartner pro Ausgangsrechnung. Leer = Geschaeftsfuehrer aus den
-- Firmenstammdaten (bisheriges Verhalten).
alter table public.ausgangsrechnungen
  add column if not exists ansprechpartner text;
