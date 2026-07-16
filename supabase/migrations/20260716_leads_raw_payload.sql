-- Rohdaten des Perspective-Webhooks mitspeichern (für Mapping-Feinschliff & Debugging)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS quelle      text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;
