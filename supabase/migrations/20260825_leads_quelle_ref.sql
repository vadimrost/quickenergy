-- Eindeutige Herkunfts-Kennung pro Lead (z.B. Message-ID der Perspective-Mail).
-- Verhindert doppelte Leads, wenn dieselbe Mail mehrfach abgeholt wird —
-- unabhängig davon, ob sie als gelesen markiert ist (n8n nutzt dasselbe Postfach).
alter table public.leads
  add column if not exists quelle_ref text;

create unique index if not exists leads_quelle_ref_uniq
  on public.leads (quelle_ref)
  where quelle_ref is not null;
