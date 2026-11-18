-- Gutschriften an Kunden als eigene Belegart der Ausgangsrechnungen.
--
-- Eigener Nummernkreis GU-1001, GU-1002 … (wie bisher in sevDesk).
-- Betraege werden wie bei Stornorechnungen NEGATIV gespeichert, damit Umsatz,
-- USt-Vorschau, Monatsbericht und BMD-Export ohne Sonderfall stimmen.
-- Positionen bleiben positiv — das PDF zeigt die Gutschrift mit positiven Betraegen.

alter table ausgangsrechnungen drop constraint if exists ausgangsrechnungen_typ_check;
alter table ausgangsrechnungen add constraint ausgangsrechnungen_typ_check
  check (typ in ('rechnung', 'teilrechnung', 'schlussrechnung', 'stornorechnung', 'gutschrift'));

create sequence if not exists gutschriften_nr_seq start 1001;

-- Hinter die hoechste schon vergebene GU-Nummer setzen (GU-1001/1002 aus sevDesk)
select setval(
  'gutschriften_nr_seq',
  greatest(
    (select coalesce(max((substring(rechnungsnummer from '^GU-(\d+)$'))::bigint), 0)
       from ausgangsrechnungen
      where rechnungsnummer ~ '^GU-\d+$'),
    1000
  ),
  true
);

create or replace function set_rechnungsnummer()
returns trigger language plpgsql as $$
declare
  kandidat text;
  versuche int := 0;
begin
  if new.rechnungsnummer is null then
    loop
      if new.typ = 'gutschrift' then
        kandidat := 'GU-' || nextval('gutschriften_nr_seq')::text;
      else
        kandidat := 'RE-' || nextval('ausgangsrechnungen_nr_seq')::text;
      end if;
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
