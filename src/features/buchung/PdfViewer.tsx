import { useState, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileX } from 'lucide-react'
import type { OcrJson } from '@/types/database'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const OCR_FIELD_COLORS: Record<string, string> = {
  rechnungsnr: 'rgba(236, 72, 153, 0.25)',
  betrag: 'rgba(59, 130, 246, 0.25)',
  ust_satz: 'rgba(16, 185, 129, 0.25)',
  faelligkeit: 'rgba(245, 158, 11, 0.25)',
  skonto_datum: 'rgba(168, 85, 247, 0.25)',
  lieferant_name: 'rgba(6, 182, 212, 0.25)',
}
const OCR_BORDER_COLORS: Record<string, string> = {
  rechnungsnr: 'rgba(236, 72, 153, 0.7)',
  betrag: 'rgba(59, 130, 246, 0.7)',
  ust_satz: 'rgba(16, 185, 129, 0.7)',
  faelligkeit: 'rgba(245, 158, 11, 0.7)',
  skonto_datum: 'rgba(168, 85, 247, 0.7)',
  lieferant_name: 'rgba(6, 182, 212, 0.7)',
}

interface PdfViewerProps {
  url: string | null
  ocrJson: OcrJson | null
}

export function PdfViewer({ url, ocrJson }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n)
    setPageNumber(1)
  }, [])

  const onPageLoadSuccess = useCallback(
    ({ width, height }: { width: number; height: number }) => {
      setPageSize({ width, height })
    },
    []
  )

  if (!url) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-ink-subtle">
        <FileX size={40} strokeWidth={1.2} />
        <div className="text-sm text-center">
          <p className="font-medium text-ink-muted">Kein PDF verfügbar</p>
          <p className="text-xs mt-0.5">Die Rechnung wurde ohne PDF-Anhang erfasst</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-surface flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPageNumber(p => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-ink-muted px-1">
            {pageNumber} / {numPages || '…'}
          </span>
          <button
            onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* OCR legend */}
          {ocrJson && (
            <div className="flex items-center gap-2 mr-3">
              {Object.keys(OCR_FIELD_COLORS)
                .filter(k => k in (ocrJson ?? {}))
                .map(k => (
                  <div key={k} className="flex items-center gap-1">
                    <div
                      className="w-2.5 h-2.5 rounded-sm border"
                      style={{ background: OCR_FIELD_COLORS[k], borderColor: OCR_BORDER_COLORS[k] }}
                    />
                    <span className="text-[10px] text-ink-subtle capitalize">{k}</span>
                  </div>
                ))}
            </div>
          )}
          <button
            onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors"
          >
            <ZoomOut size={13} />
          </button>
          <span className="text-xs text-ink-muted w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors"
          >
            <ZoomIn size={13} />
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-bg-muted flex justify-center py-6 px-4">
        <div className="relative inline-block">
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="w-[595px] h-[842px] bg-bg-surface rounded animate-pulse" />
            }
            error={
              <div className="w-[595px] h-[200px] flex items-center justify-center text-sm text-ink-muted">
                PDF konnte nicht geladen werden
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              onLoadSuccess={onPageLoadSuccess}
              renderAnnotationLayer
              renderTextLayer
            />
          </Document>

          {/* OCR highlight overlays */}
          {ocrJson && pageSize && pageNumber === 1 && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ width: pageSize.width * scale, height: pageSize.height * scale }}
            >
              {Object.entries(ocrJson).map(([field, data]) => {
                if (!data?.bbox) return null
                const [bx, by, bw, bh] = data.bbox
                return (
                  <div
                    key={field}
                    className="absolute rounded-sm"
                    style={{
                      left: bx * pageSize.width * scale,
                      top: by * pageSize.height * scale,
                      width: bw * pageSize.width * scale,
                      height: bh * pageSize.height * scale,
                      background: OCR_FIELD_COLORS[field] ?? 'rgba(236,72,153,0.2)',
                      border: `1px solid ${OCR_BORDER_COLORS[field] ?? 'rgba(236,72,153,0.6)'}`,
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
