CREATE TABLE IF NOT EXISTS kategorien (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wert text NOT NULL UNIQUE,
  name text NOT NULL,
  beschreibung text NOT NULL DEFAULT '',
  aktiv boolean NOT NULL DEFAULT true,
  reihenfolge int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kategorien ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select kategorien"
  ON kategorien FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert kategorien"
  ON kategorien FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update kategorien"
  ON kategorien FOR UPDATE TO authenticated USING (true);
CREATE POLICY "authenticated can delete kategorien"
  ON kategorien FOR DELETE TO authenticated USING (true);

INSERT INTO kategorien (wert, name, beschreibung, reihenfolge) VALUES
  ('tanken_diesel',  'Tank Diesel',     'NUR wenn explizit Diesel/Kraftstoff auf einer TANKSTELLE (Shell, OMV, BP, Jet, etc.)', 1),
  ('tanken_super',   'Tank Super',      'NUR wenn explizit Benzin/Super/E5/E10 auf einer TANKSTELLE', 2),
  ('bewirtung',      'Bewirtung',       'Restaurant, Café, Bar, Sushi, Gasthaus — Essen & Trinken', 3),
  ('dienstleistung', 'Dienstleistung',  'ALLES andere: Telekom, Internet, Strom, IT, Handwerk, Baumärkte, etc.', 4)
ON CONFLICT (wert) DO NOTHING;
