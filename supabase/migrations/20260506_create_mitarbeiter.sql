CREATE TABLE IF NOT EXISTS mitarbeiter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  aktiv boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO mitarbeiter (name, email) VALUES
  ('Granit Spahijaj', 'projektleitung@quickenergy.at'),
  ('Ismail Ilter',    'i.ilter@quickenergy.at'),
  ('Luan Posch',      null)
ON CONFLICT (email) DO NOTHING;
