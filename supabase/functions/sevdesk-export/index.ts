import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SEVDESK_TOKEN = Deno.env.get('SEVDESK_API_TOKEN')!
if (!SEVDESK_TOKEN) throw new Error('SEVDESK_API_TOKEN nicht gesetzt')
const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1'
const SEV_CLIENT_ID = '1068887'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sevGet(path: string) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { Authorization: SEVDESK_TOKEN },
  })
  if (!res.ok) throw new Error(`sevDesk GET ${path} → ${res.status}`)
  return res.json()
}

async function findOrCreateContact(name: string): Promise<string> {
  const found = await sevGet(`/Contact?name=${encodeURIComponent(name)}&limit=1`)
  if (found.objects?.length > 0) return found.objects[0].id

  const form = new FormData()
  form.append('name', name)
  form.append('status', '1000')
  form.append('objectName', 'Contact')
  form.append('category[id]', '3')
  form.append('category[objectName]', 'Category')

  const res = await fetch(`${SEVDESK_BASE}/Contact`, {
    method: 'POST',
    headers: { Authorization: SEVDESK_TOKEN },
    body: form,
  })
  if (!res.ok) throw new Error(`Kontakt anlegen fehlgeschlagen: ${res.status}`)
  const data = await res.json()
  return data.objects.id
}

async function uploadTempFile(pdfUrl: string, filename: string): Promise<string> {
  const pdfRes = await fetch(pdfUrl)
  if (!pdfRes.ok) throw new Error(`PDF nicht ladbar: ${pdfRes.status}`)
  const blob = await pdfRes.blob()

  const form = new FormData()
  form.append('file', new Blob([await blob.arrayBuffer()], { type: 'application/pdf' }), `${filename}.pdf`)

  const res = await fetch(`${SEVDESK_BASE}/Voucher/Factory/uploadTempFile`, {
    method: 'POST',
    headers: { Authorization: SEVDESK_TOKEN },
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PDF-Upload fehlgeschlagen: ${res.status} ${text}`)
  }
  const data = await res.json()
  const tempFilename = data?.objects?.filename
  if (!tempFilename) throw new Error('sevDesk: kein Dateiname zurückgegeben')
  return tempFilename
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { rechnung_ids }: { rechnung_ids: string[] } = await req.json()
    if (!rechnung_ids?.length) {
      return new Response(JSON.stringify({ error: 'rechnung_ids fehlt' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const results = []

    for (const rechnungId of rechnung_ids) {
      try {
        const { data: r, error } = await supabase
          .from('rechnungen')
          .select('*, lieferant:lieferanten(*)')
          .eq('id', rechnungId)
          .single()

        if (error || !r) throw new Error('Rechnung nicht gefunden')

        const supplierName: string =
          r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? 'Unbekannter Lieferant'
        const netAmount: number = r.betrag
        const taxRate: number = r.ust_satz ?? 20

        // PDF erst hochladen, dann filename in saveVoucher mitgeben
        let tempFilename: string | null = null
        if (r.pdf_url && r.pdf_url !== 'demo') {
          tempFilename = await uploadTempFile(r.pdf_url, r.rechnungsnr)
        }

        let supplierId: string | null = null
        try {
          supplierId = await findOrCreateContact(supplierName)
        } catch {
          // Fallback: supplierName als Freitext
        }

        const voucherDate =
          (r.rechnungsdatum ?? r.created_at.slice(0, 10)) + 'T00:00:00+01:00'
        const paymentDeadline = r.faelligkeit ? r.faelligkeit + 'T00:00:00+01:00' : null

        const voucher: Record<string, unknown> = {
          id: null,
          objectName: 'Voucher',
          mapAll: 'true',
          voucherDate,
          description: r.rechnungsnr,
          status: 100,
          currency: 'EUR',
          taxType: 'default',
          creditDebit: 'C',
          voucherType: 'VOU',
          sevClient: { id: SEV_CLIENT_ID, objectName: 'SevClient' },
        }
        if (supplierId) voucher.supplier = { id: supplierId, objectName: 'Contact' }
        else voucher.supplierName = supplierName
        if (paymentDeadline) voucher.paymentDeadline = paymentDeadline

        const voucherPos = {
          id: null,
          objectName: 'VoucherPos',
          mapAll: 'true',
          accountingType: { id: '2', objectName: 'AccountingType' },
          taxRate: Number(taxRate),
          sum: Number(netAmount),
          net: true,
          isAsset: false,
          sevClient: { id: SEV_CLIENT_ID, objectName: 'SevClient' },
        }

        const res = await fetch(`${SEVDESK_BASE}/Voucher/Factory/saveVoucher`, {
          method: 'POST',
          headers: { Authorization: SEVDESK_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            voucher,
            voucherPosSave: [voucherPos],
            voucherPosDelete: null,
            filename: tempFilename,
          }),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`saveVoucher fehlgeschlagen: ${res.status} ${text}`)
        }
        const saved = await res.json()
        const sevdeskId = saved.objects?.voucher?.id

        results.push({
          id: rechnungId,
          sevdesk_id: sevdeskId,
          supplier: supplierName,
          pdf_uploaded: !!tempFilename,
        })
      } catch (err) {
        results.push({ id: rechnungId, error: err instanceof Error ? err.message : String(err) })
      }
    }

    const allOk = results.every(r => !('error' in r))
    return new Response(JSON.stringify({ results }), {
      status: allOk ? 200 : 207,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
