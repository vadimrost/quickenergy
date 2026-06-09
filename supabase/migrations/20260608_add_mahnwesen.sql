alter table public.ausgangsrechnungen
  add column if not exists mahnstufe    smallint     not null default 0,
  add column if not exists gemahnt_am_1 date,
  add column if not exists gemahnt_am_2 date,
  add column if not exists gemahnt_am_3 date,
  add column if not exists mahngebuehr  numeric(10,2) not null default 0;
