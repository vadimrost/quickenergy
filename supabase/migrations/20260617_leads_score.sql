-- CRM: Lead Score (kommt via n8n von Perspectiv)
alter table leads add column if not exists lead_score integer check (lead_score >= 0 and lead_score <= 100);
