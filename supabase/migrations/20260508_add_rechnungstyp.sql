ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS rechnungstyp text,
  ADD COLUMN IF NOT EXISTS betrag_10 numeric,
  ADD COLUMN IF NOT EXISTS betrag_20 numeric,
  ADD COLUMN IF NOT EXISTS betrag_0  numeric;
