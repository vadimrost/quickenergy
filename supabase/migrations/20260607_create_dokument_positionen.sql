create table if not exists dokument_positionen (
  id uuid primary key default gen_random_uuid(),
  dokument_typ text not null check (dokument_typ in ('angebot', 'auftragsbestaetigung', 'rechnung')),
  dokument_id uuid not null,
  reihenfolge integer not null default 0,
  bezeichnung text not null,
  beschreibung text,
  menge numeric(12, 2) not null default 1,
  einheit text not null default 'Stk',
  einzelpreis_netto numeric(12, 2) not null default 0,
  ust_satz integer not null default 20 check (ust_satz in (0, 10, 20)),
  rabatt_prozent numeric(5, 2) not null default 0,
  -- computed client-side and stored for PDF/reporting: menge * einzelpreis_netto * (1 - rabatt_prozent/100)
  zeilenbetrag_netto numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index on dokument_positionen (dokument_typ, dokument_id, reihenfolge);

alter table dokument_positionen enable row level security;
create policy "auth users full access" on dokument_positionen for all using (auth.role() = 'authenticated');
