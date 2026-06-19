create table if not exists lead_dateien (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  name          text not null,
  storage_path  text not null,
  mime_type     text,
  groesse       int,
  erstellt_von  text,
  created_at    timestamptz default now()
);

create index on lead_dateien(lead_id);
alter table lead_dateien enable row level security;
create policy "auth users full access on lead_dateien"
  on lead_dateien for all to authenticated
  using (true) with check (true);
