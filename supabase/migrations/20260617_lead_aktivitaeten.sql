-- CRM: Aktivitäts-Timeline für Leads
create table if not exists lead_aktivitaeten (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  typ        text not null,
  inhalt     text,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_aktivitaeten_lead_id_idx
  on lead_aktivitaeten(lead_id, created_at desc);

alter table lead_aktivitaeten enable row level security;
create policy "allow_all" on lead_aktivitaeten
  for all using (true) with check (true);

-- Backfill: "erstellt" für alle bestehenden Leads
insert into lead_aktivitaeten (lead_id, typ, inhalt, created_at)
select id, 'erstellt', 'Lead erstellt', created_at from leads;

-- Trigger: "erstellt" automatisch bei neuen Leads
create or replace function _trg_lead_erstellt()
returns trigger language plpgsql as $$
begin
  insert into lead_aktivitaeten (lead_id, typ, inhalt, created_at)
  values (new.id, 'erstellt', 'Lead erstellt', now());
  return new;
end;
$$;

drop trigger if exists trg_lead_erstellt on leads;
create trigger trg_lead_erstellt
  after insert on leads
  for each row execute function _trg_lead_erstellt();
