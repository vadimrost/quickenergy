-- Kontoauszuege (bank statement headers)
CREATE TABLE IF NOT EXISTS kontoauszuege (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_url          text,
  konto_iban       text,
  konto_name       text,
  auszug_nr        text,
  von_datum        date,
  bis_datum        date,
  alter_kontostand numeric,
  neuer_kontostand numeric,
  created_at       timestamptz DEFAULT now()
);

-- Individual bank transactions
CREATE TABLE IF NOT EXISTS bank_transaktionen (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kontoauszug_id  uuid REFERENCES kontoauszuege(id) ON DELETE CASCADE,
  datum           date NOT NULL,
  betrag          numeric NOT NULL,
  buchungstext    text NOT NULL DEFAULT '',
  empfaenger      text,
  referenz        text,
  typ             text NOT NULL DEFAULT 'ueberweisung',
  matched         boolean NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

-- Link invoices to transactions
ALTER TABLE rechnungen
  ADD COLUMN IF NOT EXISTS bank_transaktion_id uuid REFERENCES bank_transaktionen(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bezahlt_am          date,
  ADD COLUMN IF NOT EXISTS bezahlt_konto       text;

-- Link payroll entries to transactions
ALTER TABLE lohn_dienstnehmer
  ADD COLUMN IF NOT EXISTS bank_transaktion_id uuid REFERENCES bank_transaktionen(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE kontoauszuege    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transaktionen ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kontoauszuege' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON kontoauszuege FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_transaktionen' AND policyname = 'allow_all') THEN
    CREATE POLICY allow_all ON bank_transaktionen FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
