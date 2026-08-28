-- Automatische Rechnungsnummern kollidieren mit importierten Belegnummern.
--
-- Ursache: Seit dem PDF-Import werden die ECHTEN Nummern vom Beleg uebernommen
-- (z.B. RE-10025122). Die Sequenz zaehlt davon unabhaengig hoch und laeuft
-- irgendwann genau in eine bereits vergebene Nummer -> unique violation beim
-- Anlegen einer Rechnung aus einer Auftragsbestaetigung.
--
-- Fix 1: Sequenz hinter die hoechste vorhandene RE-Nummer setzen.
-- Fix 2: Trigger ueberspringt belegte Nummern, statt an ihnen zu scheitern.

select setval(
  'ausgangsrechnungen_nr_seq',
  greatest(
    (select coalesce(max((substring(rechnungsnummer from '^RE-(\d+)$'))::bigint), 0)
       from ausgangsrechnungen
      where rechnungsnummer ~ '^RE-\d+$'),
    10025096
  ) + 1
);

create or replace function set_rechnungsnummer()
returns trigger language plpgsql as $$
declare
  kandidat text;
  versuche int := 0;
begin
  if new.rechnungsnummer is null then
    loop
      kandidat := 'RE-' || nextval('ausgangsrechnungen_nr_seq')::text;
      exit when not exists (
        select 1 from ausgangsrechnungen where rechnungsnummer = kandidat
      );
      versuche := versuche + 1;
      if versuche > 1000 then
        raise exception 'Keine freie Rechnungsnummer gefunden (nach % Versuchen)', versuche;
      end if;
    end loop;
    new.rechnungsnummer := kandidat;
  end if;

  -- auto-calculate Faelligkeitsdatum
  if new.faelligkeitsdatum is null and new.rechnungsdatum is not null then
    new.faelligkeitsdatum := new.rechnungsdatum + new.zahlungsziel_tage;
  end if;
  return new;
end;
$$;
