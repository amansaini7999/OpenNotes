import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import { decodeBase64 } from './assets'
import type { SourceAsset } from './model'

export async function openPdfTask(bytes: Uint8Array): Promise<PDFDocumentLoadingTask> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs.getDocument({
    data: bytes,
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
    iccUrl: `${import.meta.env.BASE_URL}pdfjs/iccs/`,
  })
}

export type PdfPreviewLoader = (source: SourceAsset, pageIndex: number, signal: AbortSignal) => Promise<string>

export function createPdfPreviewStore() {
  const documents = new Map<string, Promise<PDFDocumentLoadingTask>>()
  const previews = new Map<string, string>()
  let queue: Promise<unknown> = Promise.resolve()
  let closed = false
  const check = (signal: AbortSignal) => {
    if (closed || signal.aborted) throw new DOMException('PDF preview no longer needed.', 'AbortError')
  }
  const load: PdfPreviewLoader = (source, pageIndex, signal) => {
    const result = queue.then(async () => {
      check(signal)
      const key = `${source.id}:${pageIndex}`
      const cached = previews.get(key)
      if (cached) {
        previews.delete(key); previews.set(key, cached)
        return cached
      }
      let opening = documents.get(source.id)
      if (!opening) {
        // One active book decoder at a time; preview strings are separately bounded.
        for (const previous of documents.values()) await (await previous).destroy()
        documents.clear()
        opening = openPdfTask(decodeBase64(source.data))
        documents.set(source.id, opening)
      }
      const document = await (await opening).promise
      check(signal)
      const page = await document.getPage(pageIndex + 1)
      const canvas = window.document.createElement('canvas')
      try {
        check(signal)
        const original = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: Math.min(1200 / original.width, 1600 / original.height) })
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('The PDF preview could not allocate a canvas. Close other tabs and retry.')
        const render = page.render({ canvasContext: context, canvas, viewport })
        const cancel = () => render.cancel()
        signal.addEventListener('abort', cancel, { once: true })
        try { await render.promise }
        finally { signal.removeEventListener('abort', cancel) }
        check(signal)
        const preview = canvas.toDataURL('image/jpeg', 0.88)
        previews.set(key, preview)
        if (previews.size > 12) previews.delete(previews.keys().next().value!)
        return preview
      } finally {
        canvas.width = 0; canvas.height = 0
        page.cleanup()
      }
    })
    queue = result.then(() => undefined, () => undefined)
    return result
  }
  return {
    load,
    async close() {
      closed = true
      await queue
      await Promise.all([...documents.values()].map(async opening => (await opening).destroy()))
      documents.clear(); previews.clear()
    },
  }
}
