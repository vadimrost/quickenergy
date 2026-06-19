-- CRM: Setter-Zuweisung, Deal-Wert, Kundennachricht
-- Run in Supabase SQL Editor

alter table leads add column if not exists zugewiesen_an text;
alter table leads add column if not exists deal_wert      numeric(12, 2) default 0;
alter table leads add column if not exists nachricht      text;
