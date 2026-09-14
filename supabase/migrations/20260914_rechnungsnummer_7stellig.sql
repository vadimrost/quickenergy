-- Rechnungsnummern: die echte Nummernfolge des Betriebs ist 7-stellig
-- (RE-1002610 … RE-1002683). Die 8-stelligen RE-10025xxx sind alte, per PDF
-- importierte Belege und bleiben unveraendert — sie duerfen die Sequenz aber
-- nicht mehr nach oben ziehen (genau das hat 20260826 gemacht, weil dort ueber
-- ALLE RE-Nummern gemaxt wurde).
--
-- Sequenz auf die hoechste 7-stellige Nummer setzen; nextval liefert dann +1.
-- Der Trigger set_rechnungsnummer ueberspringt belegte Nummern weiterhin.
select setval(
  'ausgangsrechnungen_nr_seq',
  (select max((substring(rechnungsnummer from '^RE-(\d{7})$'))::bigint)
     from ausgangsrechnungen
    where rechnungsnummer ~ '^RE-\d{7}$'),
  true
);
