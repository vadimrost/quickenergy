-- CRM: Vollständige Adressfelder (für Google Maps Embed)
alter table leads add column if not exists strasse    text;
alter table leads add column if not exists hausnummer text;
alter table leads add column if not exists ort        text;
