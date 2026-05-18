ALTER TABLE mitarbeiter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select mitarbeiter"
  ON mitarbeiter FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated can insert mitarbeiter"
  ON mitarbeiter FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated can update mitarbeiter"
  ON mitarbeiter FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "authenticated can delete mitarbeiter"
  ON mitarbeiter FOR DELETE
  TO authenticated
  USING (true);
