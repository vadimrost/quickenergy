-- Teil D2/D3/D5: Dokumenttyp-Erkennung für Eingangsrechnungen
-- Steuerberaterin: Angebote/Mahnungen/Lieferscheine sind keine Eingangsrechnungen,
-- mehrseitige Rechnungen müssen vollständig sein.
alter table rechnungen
  -- erkannter Dokumenttyp: rechnung | angebot | mahnung | lieferschein | proforma | sonstige
  add column if not exists dokument_art text,
  -- menschenlesbarer Prüf-Hinweis (z.B. "Angebot – keine Eingangsrechnung"), null = ok
  add column if not exists pruef_hinweis text;
