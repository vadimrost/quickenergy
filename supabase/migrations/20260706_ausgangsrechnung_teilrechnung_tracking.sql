-- Teil B + C: Teilrechnungs-Tracking & Schlussrechnung-Übersicht
-- Verknüpft Ausgangsrechnungen direkt mit einem Angebot und verfolgt,
-- wie viel des Auftragswerts bereits in Teilrechnungen fakturiert wurde.
alter table ausgangsrechnungen
  -- direkte Verknüpfung zum Angebot (Auftrag), gegen das fakturiert wird
  add column if not exists angebot_id uuid references angebote(id) on delete set null,
  -- Auftragswert netto (Gesamtsumme des Angebots) — Snapshot je Rechnung
  add column if not exists auftragswert_netto numeric(12, 2),
  -- Schlussrechnung: eingefrorene Übersicht aller Rechnungen zum Auftrag
  -- [{ rechnungsnummer, datum, label, netto }]
  add column if not exists rechnungsuebersicht jsonb,
  -- Schlussrechnung: bereits fakturierte Netto-Summe der Teilrechnungen
  add column if not exists bereits_berechnet_netto numeric(12, 2),
  -- Schlussrechnung: verbleibender Netto-Restbetrag (Auftragswert − bereits berechnet)
  add column if not exists restbetrag_netto numeric(12, 2);

create index if not exists idx_ausgangsrechnungen_angebot
  on ausgangsrechnungen (angebot_id);
