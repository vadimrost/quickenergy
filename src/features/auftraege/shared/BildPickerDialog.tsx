import { useRef } from 'react'
import { Upload, Trash2, ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useBilder, useUploadBild, useDeleteBild } from './useBilder'
import type { Bild } from '@/types/database'

export function BildPickerDialog({ open, onClose, onSelect }: {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: bilder = [], isLoading } = useBilder()
  const upload = useUploadBild()
  const del = useDeleteBild()

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      try {
        await upload.mutateAsync(file)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      }
    }
  }

  const handleDelete = (bild: Bild) => {
    if (!confirm('Bild wirklich löschen?')) return
    del.mutate(bild, {
      onError: e => toast.error(e instanceof Error ? e.message : 'Löschen fehlgeschlagen'),
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg bg-white border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-ink">Bild auswählen</DialogTitle>
        </DialogHeader>

        <div className="pt-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { void handleFiles(e.target.files); e.target.value = '' }}
          />

          <button
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-card border-2 border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-ink hover:border-accent-400 hover:bg-accent-50 transition-colors disabled:opacity-50 mb-4"
          >
            {upload.isPending ? <Loader2 size={16} className="animate-spin text-accent-500" /> : <Upload size={16} className="text-accent-500" />}
            Neues Bild hochladen
          </button>

          {isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 size={22} className="animate-spin text-accent-500" />
            </div>
          ) : bilder.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink-muted">
              <ImageIcon size={22} className="mx-auto mb-2 text-ink-subtle" />
              Noch keine Bilder im Archiv.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {bilder.map(bild => (
                <div key={bild.id} className="relative group aspect-square rounded-card overflow-hidden border border-border">
                  <button
                    onClick={() => { onSelect(bild.url); onClose() }}
                    className="w-full h-full"
                    title={bild.name ?? 'Bild'}
                  >
                    <img src={bild.url} alt={bild.name ?? ''} className="w-full h-full object-cover" />
                  </button>
                  <button
                    onClick={() => handleDelete(bild)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    title="Bild löschen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
