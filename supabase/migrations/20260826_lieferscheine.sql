-- Lieferscheine (aus Angebot oder Auftragsbestaetigung erzeugt).
-- Bewusst OHNE Preisfelder: ein Lieferschein weist nur Mengen aus.
create table if not exists lieferscheine (
  id                uuid primary key default gen_random_uuid(),
  lieferschein_nr   text unique,
  status            text not null default 'entwurf'
                      check (status in ('entwurf', 'geliefert', 'storniert')),
  kunde_id          uuid references kunden(id) on delete set null,
  angebot_id        uuid references angebote(id) on delete set null,
  ab_id             uuid references auftragsbestatigungen(id) on delete set null,
  betreff           text,
  lieferdatum       date not null default current_date,
  lieferadresse     text,
  kopftext          text default 'Sehr geehrte Damen und Herren,

hiermit liefern wir Ihnen die folgenden Positionen. Bitte pruefen Sie die Lieferung auf Vollstaendigkeit.',
  fusstext          text default 'Bei Rueckfragen stehen wir Ihnen jederzeit gerne zur Verfuegung.

Mit freundlichen Gruessen,
Quick Energy',
  created_at        timestamptz not null default now()
);

create sequence if not exists lieferscheine_nr_seq start 1001;

create or replace function set_lieferschein_nr()
returns trigger language plpgsql as $$
declare kandidat text; versuche int := 0;
begin
  if new.lieferschein_nr is null then
    loop
      kandidat := 'LS-' || nextval('lieferscheine_nr_seq')::text;
      exit when not exists (select 1 from lieferscheine where lieferschein_nr = kandidat);
      versuche := versuche + 1;
      if versuche > 1000 then raise exception 'Keine freie Lieferschein-Nummer gefunden'; end if;
    end loop;
    new.lieferschein_nr := kandidat;
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_lieferschein_nr') then
    create trigger trg_lieferschein_nr before insert on lieferscheine
      for each row execute function set_lieferschein_nr();
  end if;
end $$;

alter table lieferscheine enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'lieferscheine' and policyname = 'auth users full access') then
    create policy "auth users full access" on lieferscheine for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- dokument_positionen muss den neuen Typ zulassen
alter table dokument_positionen drop constraint if exists dokument_positionen_dokument_typ_check;
alter table dokument_positionen add constraint dokument_positionen_dokument_typ_check
  check (dokument_typ in ('angebot', 'auftragsbestaetigung', 'rechnung', 'lieferschein'));

notify pgrst, 'reload schema';
