-- CRM: leads Tabelle
-- Run this in Supabase SQL Editor

create type lead_status as enum (
  'neu',
  'kontaktiert',
  'termin',
  'angebot',
  'auftrag',
  'abgeschlossen',
  'verloren'
);

create table leads (
  id                uuid         primary key default gen_random_uuid(),
  created_at        timestamptz  not null default now(),
  vorname           text,
  nachname          text,
  email             text,
  telefon           text,
  plz               text,
  bundesland        text,
  anlagenort        text,
  anlagengroesse    text,
  batteriespeicher  boolean,
  umsetzung         text,
  status            lead_status  not null default 'neu',
  notiz             text,
  termin_datum      timestamptz,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_term          text,
  utm_content       text,
  utm_id            text,
  kunde_id          uuid references kunden(id) on delete set null
);

alter table leads enable row level security;

create policy "Authenticated full access on leads"
  on leads for all
  to authenticated
  using (true)
  with check (true);

-- Allow anon read+insert for n8n webhook (uses anon key)
create policy "Anon can insert leads"
  on leads for insert
  to anon
  with check (true);
