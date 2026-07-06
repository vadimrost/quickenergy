-- Dokument-Vorlagen (wiederverwendbare Positions-Sets für Angebote etc.)
-- Ziel: Standard-Angebote (z.B. Klimaanlagen) per Klick laden.
create table if not exists dokument_vorlagen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  typ text not null default 'angebot'
    check (typ in ('angebot', 'auftragsbestaetigung', 'rechnung')),
  betreff text,
  kopftext text,
  fusstext text,
  rabatt_gesamt_prozent numeric(5, 2) not null default 0,
  -- positionen: Array von PositionDraft ohne id/dokument_id/dokument_typ
  -- { reihenfolge, bezeichnung, beschreibung, menge, einheit,
  --   einzelpreis_netto, ust_satz, rabatt_prozent, zeilenbetrag_netto }
  positionen jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table dokument_vorlagen enable row level security;
create policy "auth users full access" on dokument_vorlagen
  for all using (auth.role() = 'authenticated');

-- Seed: Standard-Klimaanlage (3 Innengeräte + 1 Außengerät), abgeleitet aus AN-1121
insert into dokument_vorlagen (name, typ, betreff, kopftext, fusstext, positionen)
select
  'Klimaanlage – 3× Innen + 1× Außen',
  'angebot',
  'Montage einer Klimaanlage inkl. Inbetriebnahme (3 Innengeräte mit 1 Außengerät)',
  'Sehr geehrte Damen und Herren,

herzlichen Dank für Ihre Anfrage. Es freut uns, Ihnen das gewünschte, unverbindliche Angebot unterbreiten zu dürfen.

ACHTUNG:
Dieses Angebot beinhaltet eine maximale Leitungslänge von 7 Metern sowie eine bereits vorhandene elektrische Versorgung für das Innen- oder Außengerät.
Für jede zusätzlich benötigte Leitungslänge werden 75,00 € brutto pro Laufmeter verrechnet.
Sollte keine elektrische Versorgung für das Innen- oder Außengerät vorhanden sein, muss diese hergestellt werden. Die dafür erforderlichen Elektroarbeiten werden pauschal gemäß Aufwand zusätzlich verrechnet und sind nicht im Angebotspreis enthalten.',
  'Für etwaige Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.
Wir schätzen Ihr Vertrauen und bedanken uns herzlich dafür.

Mit freundlichen Grüßen,
Quick Energy',
  '[
    {
      "reihenfolge": 0,
      "bezeichnung": "ALVA Klima Set 1x Klima Außeneinheit Multi 7,9 kW, 1x Klima Inneneinheit 2,0 kW, 2x Klima Inneneinheit 2,5 kW",
      "beschreibung": "• Steuerung via Smartphone-App oder Fernbedienung\n• Robuste Konstruktion für konstante Kühl- und Heizlösungen\n• Hocheffizienter Filter – eliminiert über 95 % der Bakterien, Pilze und Mikroben\n• Stilvolles Design\n• 5 Jahre Garantie",
      "menge": 1,
      "einheit": "Stk",
      "einzelpreis_netto": 1700,
      "ust_satz": 20,
      "rabatt_prozent": 0,
      "zeilenbetrag_netto": 1700
    },
    {
      "reihenfolge": 1,
      "bezeichnung": "Montage & Anschluss Klimaanlage",
      "beschreibung": "Fachgerechter Anschluss von 3 Inneneinheiten und 1 Außeneinheit inkl. kompletter Verrohrung, Verkabelung und Dichtheitsprüfung.\n\nInkl. elektrischem Anschluss, Vakuumierung der Anlage, Befüllung (falls erforderlich) sowie Inbetriebnahme und Funktionsprüfung.\n\nÜbergabe der betriebsbereiten Anlage inkl. kurzer Einschulung des Kunden.\n\nKernbohrung",
      "menge": 1,
      "einheit": "pausch",
      "einzelpreis_netto": 1950,
      "ust_satz": 20,
      "rabatt_prozent": 0,
      "zeilenbetrag_netto": 1950
    },
    {
      "reihenfolge": 2,
      "bezeichnung": "Montage Material",
      "beschreibung": "Kälteleitungen für Klimaanlage (Kältemittel R32)\nBoden-/Wandhalterung für Außeneinheit\nAnschlusskabel für Innen- und Außeneinheit",
      "menge": 1,
      "einheit": "pausch",
      "einzelpreis_netto": 950,
      "ust_satz": 20,
      "rabatt_prozent": 0,
      "zeilenbetrag_netto": 950
    }
  ]'::jsonb
where not exists (
  select 1 from dokument_vorlagen where name = 'Klimaanlage – 3× Innen + 1× Außen'
);
