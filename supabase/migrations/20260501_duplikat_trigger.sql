-- Unique constraint: verhindert doppelte Paare (A,B) und (B,A)
alter table public.duplikate
  drop constraint if exists duplikate_pair_unique;
alter table public.duplikate
  add constraint duplikate_pair_unique unique (rechnung_a_id, rechnung_b_id);

-- Funktion: erkennt Duplikate für eine gegebene Rechnung
-- Scoring identisch mit Frontend (useBuchung.ts):
--   betrag gleich       → +0.45
--   lieferant gleich    → +0.35
--   rechnungsnr-Präfix  → +0.15  (Präfix = alles ohne abschließende Ziffern, min. 3 Zeichen)
--   ust_satz gleich     → +0.05
--   Schwellenwert: ≥ 0.50
create or replace function public.detect_duplikate(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r         public.rechnungen%rowtype;
  c         public.rechnungen%rowtype;
  score     numeric;
  prefix_a  text;
  prefix_b  text;
  id_a      uuid;
  id_b      uuid;
begin
  select * into r from public.rechnungen where id = p_id;
  if not found then return; end if;

  -- alte Einträge für diese Rechnung löschen, damit sie neu berechnet werden
  delete from public.duplikate
  where rechnung_a_id = p_id or rechnung_b_id = p_id;

  for c in select * from public.rechnungen where id <> p_id loop
    score := 0;

    if r.betrag = c.betrag then
      score := score + 0.45;
    end if;

    if r.lieferant_id is not null and r.lieferant_id = c.lieferant_id then
      score := score + 0.35;
    end if;

    prefix_a := regexp_replace(r.rechnungsnr, '\d+$', '');
    prefix_b := regexp_replace(c.rechnungsnr, '\d+$', '');
    if char_length(prefix_a) > 2 and prefix_a = prefix_b then
      score := score + 0.15;
    end if;

    if r.ust_satz = c.ust_satz then
      score := score + 0.05;
    end if;

    if score >= 0.50 then
      -- kleinere UUID immer als rechnung_a_id → verhindert doppelte Paare
      id_a := least(p_id::text, c.id::text)::uuid;
      id_b := greatest(p_id::text, c.id::text)::uuid;

      insert into public.duplikate (rechnung_a_id, rechnung_b_id, match_score)
      values (id_a, id_b, round(score, 2))
      on conflict (rechnung_a_id, rechnung_b_id)
      do update set match_score = excluded.match_score;
    end if;
  end loop;
end;
$$;

-- Trigger-Funktion
create or replace function public.trigger_detect_duplikate()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.detect_duplikate(NEW.id);
  return NEW;
end;
$$;

-- Trigger auf INSERT und UPDATE
drop trigger if exists on_rechnung_upsert on public.rechnungen;
create trigger on_rechnung_upsert
  after insert or update of betrag, lieferant_id, rechnungsnr, ust_satz
  on public.rechnungen
  for each row execute function public.trigger_detect_duplikate();

-- Einmalig: alle vorhandenen Rechnungen prüfen
do $$
declare
  r record;
begin
  for r in select id from public.rechnungen loop
    perform public.detect_duplikate(r.id);
  end loop;
end;
$$;
