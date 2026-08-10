-- Einkaufspreis pro Position (für KI-Import von Lieferanten-Angeboten + Marge)
alter table public.dokument_positionen
  add column if not exists ek_netto numeric;
