-- Manuelles "bezahlt"-Kennzeichen für Dienstnehmer (v.a. Barzahlungen ohne Bank-Match)
ALTER TABLE lohn_dienstnehmer
  ADD COLUMN IF NOT EXISTS bezahlt    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bezahlt_am date;
