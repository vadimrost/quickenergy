import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Building2, Phone, Landmark } from 'lucide-react'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useFirmaStammdaten, useUpsertFirma } from './useFirmaStammdaten'
import type { FirmaStammdaten } from '@/types/database'

type FormState = Omit<FirmaStammdaten, 'id' | 'updated_at' | 'logo_url'>

const EMPTY: FormState = {
  name: '', strasse: '', plz_ort: '', land: 'Österreich',
  tel: '', email: '', web: '',
  uid: '', fn_nr: '', steuer_nr: '', gericht: '', gf: '',
  bank: '', iban: '', bic: '', konto: '', blz: '',
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-muted mb-1 block">{label}</label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  )
}

export function EinstellungenPage() {
  const { data: firma, isPending } = useFirmaStammdaten()
  const { mutate: upsert, isPending: saving } = useUpsertFirma()
  const [form, setForm] = useState<FormState>(EMPTY)

  useEffect(() => {
    if (firma) {
      setForm({
        name: firma.name, strasse: firma.strasse, plz_ort: firma.plz_ort,
        land: firma.land, tel: firma.tel, email: firma.email, web: firma.web,
        uid: firma.uid, fn_nr: firma.fn_nr, steuer_nr: firma.steuer_nr,
        gericht: firma.gericht, gf: firma.gf,
        bank: firma.bank, iban: firma.iban, bic: firma.bic,
        konto: firma.konto, blz: firma.blz,
      })
    }
  }, [firma])

  function set(key: keyof FormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleSave() {
    upsert(
      { ...form, logo_url: firma?.logo_url ?? null, id: firma?.id },
      {
        onSuccess: () => toast.success('Firmendaten gespeichert'),
        onError: e => toast.error(String(e)),
      }
    )
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-5">
      <PageTitle title="Einstellungen" subtitle="Firmenstammdaten für PDF-Dokumente" />

      {/* Firmendaten */}
      <SectionCard title={<span className="flex items-center gap-2"><Building2 size={14} /> Firmendaten</span>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Firmenname" value={form.name} onChange={v => set('name', v)}
              placeholder="Muster GmbH" />
          </div>
          <Field label="Straße + Hausnummer" value={form.strasse} onChange={v => set('strasse', v)}
            placeholder="Musterstraße 1" />
          <Field label="PLZ + Ort" value={form.plz_ort} onChange={v => set('plz_ort', v)}
            placeholder="1010 Wien" />
          <Field label="Land" value={form.land} onChange={v => set('land', v)}
            placeholder="Österreich" />
          <Field label="Geschäftsführung" value={form.gf} onChange={v => set('gf', v)}
            placeholder="Max Mustermann" />
          <Field label="UID-Nummer" value={form.uid} onChange={v => set('uid', v)}
            placeholder="ATU12345678" />
          <Field label="Firmenbuchnummer" value={form.fn_nr} onChange={v => set('fn_nr', v)}
            placeholder="123456a" />
          <Field label="Steuernummer" value={form.steuer_nr} onChange={v => set('steuer_nr', v)}
            placeholder="123/4567" />
          <Field label="Firmenbuchgericht" value={form.gericht} onChange={v => set('gericht', v)}
            placeholder="HG Wien" />
        </div>
      </SectionCard>

      {/* Kontakt */}
      <SectionCard title={<span className="flex items-center gap-2"><Phone size={14} /> Kontakt</span>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Telefon" value={form.tel} onChange={v => set('tel', v)}
            placeholder="+43 1 234 5678" />
          <Field label="E-Mail" value={form.email} onChange={v => set('email', v)}
            placeholder="office@firma.at" />
          <Field label="Website" value={form.web} onChange={v => set('web', v)}
            placeholder="www.firma.at" />
        </div>
      </SectionCard>

      {/* Bank */}
      <SectionCard title={<span className="flex items-center gap-2"><Landmark size={14} /> Bankverbindung</span>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank" value={form.bank} onChange={v => set('bank', v)}
            placeholder="Erste Bank" />
          <Field label="IBAN" value={form.iban} onChange={v => set('iban', v)}
            placeholder="AT12 3456 7890 1234 5678" />
          <Field label="BIC / SWIFT" value={form.bic} onChange={v => set('bic', v)}
            placeholder="GIBAATWW" />
          <Field label="Kontonummer" value={form.konto} onChange={v => set('konto', v)}
            placeholder="12345678" />
          <Field label="BLZ" value={form.blz} onChange={v => set('blz', v)}
            placeholder="20111" />
        </div>
      </SectionCard>

      <div className="flex justify-end pb-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Speichern…' : 'Speichern'}
        </Button>
      </div>
    </div>
  )
}
