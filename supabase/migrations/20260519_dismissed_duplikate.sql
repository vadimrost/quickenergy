create table if not exists dismissed_duplikate (
  id         uuid primary key default gen_random_uuid(),
  pair_key   text not null unique,
  created_at timestamptz default now()
);

alter table dismissed_duplikate enable row level security;
create policy "Alle authentifizierten Nutzer können lesen und schreiben"
  on dismissed_duplikate for all
  to authenticated
  using (true)
  with check (true);
