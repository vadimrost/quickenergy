-- Benachrichtigungen für CRM (Status-Änderungen, Zuweisungen, neue Leads)
create table if not exists benachrichtigungen (
  id          uuid primary key default gen_random_uuid(),
  empfaenger  text not null,   -- 'admin' = alle Admins, oder setter_name für spezifischen Setter
  typ         text not null,   -- 'neuer_lead' | 'status' | 'zuweisung' | 'termin'
  titel       text not null,
  nachricht   text,
  lead_id     uuid references leads(id) on delete cascade,
  gelesen     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists benachrichtigungen_empfaenger_idx
  on benachrichtigungen(empfaenger, gelesen, created_at desc);

alter table benachrichtigungen enable row level security;
create policy "allow_all" on benachrichtigungen for all using (true) with check (true);

-- Realtime aktivieren
alter publication supabase_realtime add table benachrichtigungen;

-- DB-Trigger: neuer Lead → Benachrichtigung für alle Admins
create or replace function _trg_lead_neu_benachrichtigung()
returns trigger language plpgsql as $$
declare
  v_name text;
begin
  v_name := coalesce(
    trim(coalesce(new.vorname,'') || ' ' || coalesce(new.nachname,'')),
    new.email,
    'Unbekannt'
  );
  insert into benachrichtigungen (empfaenger, typ, titel, nachricht, lead_id)
  values (
    'admin',
    'neuer_lead',
    'Neuer Lead: ' || v_name,
    coalesce(new.utm_source, 'Direktanfrage') || ' · ' || coalesce(new.plz, ''),
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_lead_neu_benachrichtigung on leads;
create trigger trg_lead_neu_benachrichtigung
  after insert on leads
  for each row execute function _trg_lead_neu_benachrichtigung();
