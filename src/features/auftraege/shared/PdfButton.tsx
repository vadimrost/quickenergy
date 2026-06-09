import { useState, useCallback } from 'react'
import { pdf } from '@react-pdf/renderer'
import { Download, Eye, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { QuickEnergyPdf } from './PdfDocument'
import { useFirmaStammdaten } from '@/features/einstellungen/useFirmaStammdaten'
import type { Angebot, Auftragsbestaetigung, Ausgangsrechnung } from '@/types/database'

type Input =
  | { typ: 'angebot'; doc: Angebot }
  | { typ: 'auftragsbestaetigung'; doc: Auftragsbestaetigung }
  | { typ: 'rechnung'; doc: Ausgangsrechnung }

function dateiname(input: Input): string {
  if (input.typ === 'angebot') return `Angebot_${(input.doc as Angebot).angebotsnummer}.pdf`
  if (input.typ === 'auftragsbestaetigung') return `AB_${(input.doc as Auftragsbestaetigung).ab_nummer}.pdf`
  return `Rechnung_${(input.doc as Ausgangsrechnung).rechnungsnummer}.pdf`
}

export function PdfButton(input: Input) {
  const [loading, setLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const { data: firma } = useFirmaStammdaten()

  const generateBlob = useCallback(async () => {
    setLoading(true)
    try {
      const blob = await pdf(<QuickEnergyPdf {...input} firma={firma ?? null} />).toBlob()
      return blob
    } finally {
      setLoading(false)
    }
  }, [input.typ, input.doc, firma])

  async function handleDownload() {
    const blob = await generateBlob()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = dateiname(input)
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handlePreview() {
    const blob = await generateBlob()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePreview}
          disabled={loading}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
          <span className="ml-1.5">Vorschau</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={loading}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          <span className="ml-1.5">PDF herunterladen</span>
        </Button>
      </div>

      <Dialog open={!!previewUrl} onOpenChange={open => !open && closePreview()}>
        <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden">
          {previewUrl && (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title="PDF Vorschau"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
