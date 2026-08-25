-- Kampagne/Funnel als eigenes Feld (zum Filtern und Auswerten).
-- Stand bisher nur im Notiz-Text bzw. in raw_payload.
alter table public.leads
  add column if not exists kampagne text;

-- Bestehende Perspective-Leads aus den Rohdaten nachtragen
update public.leads
   set kampagne = raw_payload ->> 'funnel'
 where quelle = 'perspective'
   and kampagne is null
   and raw_payload ->> 'funnel' is not null;

create index if not exists leads_kampagne_idx on public.leads (kampagne);

notify pgrst, 'reload schema';
