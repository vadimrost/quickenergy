create table if not exists public.firma_einstellungen (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  strasse     text not null default '',
  plz_ort     text not null default '',
  land        text not null default 'Österreich',
  tel         text not null default '',
  email       text not null default '',
  web         text not null default '',
  uid         text not null default '',
  fn_nr       text not null default '',
  steuer_nr   text not null default '',
  gericht     text not null default '',
  gf          text not null default '',
  bank        text not null default '',
  iban        text not null default '',
  bic         text not null default '',
  konto       text not null default '',
  blz         text not null default '',
  logo_url    text,
  updated_at  timestamptz default now()
);

insert into public.firma_einstellungen (
  name, strasse, plz_ort, land, tel, email, web,
  uid, fn_nr, steuer_nr, gericht, gf,
  bank, iban, bic, konto, blz
) values (
  'Quick Energy Handels-, Klima- und Elektrotechnik GmbH',
  'Sieveringerstraße 56A',
  '1190 Wien',
  'Österreich',
  '+43 6644 614126',
  'sales@quickenergy.at',
  'www.quickenergy.at',
  'ATU78058389',
  '5791131',
  '074161191',
  'HG Wien',
  'Philipp Slupetzky',
  'Erste Bank',
  'AT62 2011 1290 2612 2005',
  'GIBAATWW',
  '29026122005',
  '20111'
);

alter table public.firma_einstellungen enable row level security;
create policy "auth read"   on public.firma_einstellungen for select using (auth.role() = 'authenticated');
create policy "auth update" on public.firma_einstellungen for update using (auth.role() = 'authenticated');
create policy "auth insert" on public.firma_einstellungen for insert with check (auth.role() = 'authenticated');
