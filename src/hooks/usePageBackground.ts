import { useEffect, useState } from 'react'
import type { NotePage, SourceAsset } from '../model'
import type { PdfPreviewLoader } from '../pdf-source'

export function usePageBackground(page: NotePage, sources: SourceAsset[], load: PdfPreviewLoader, onError: (message: string) => void, enabled = true) {
  const source = page.source ? sources.find(source => source.id === page.source!.assetId) : undefined
  const index = page.source?.pageIndex
  const [preview, setPreview] = useState<{ id: string; index: number; data: string } | null>(null)
  useEffect(() => {
    if (!enabled) { setPreview(null); return }
    if (page.background || source?.kind !== 'pdf' || index === undefined) return
    const abort = new AbortController()
    void load(source, index, abort.signal).then(data => {
      if (!abort.signal.aborted) setPreview({ id: source.id, index, data })
    }).catch((cause: unknown) => {
      if (!abort.signal.aborted) onError(`PDF page ${index + 1} could not be displayed: ${cause instanceof Error ? cause.message : 'Preview failed.'} Reopen the notebook to retry; the original PDF is preserved.`)
    })
    return () => abort.abort()
  }, [enabled, page.background, source, index, load, onError])
  return page.background ?? (preview?.id === source?.id && preview?.index === index ? preview?.data : undefined)
}
