import { createNotebook, createPage, safeFilename, type Library, type Notebook } from './model'
import { loadImage, paintPage } from './render'

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function exportBackup(library: Library, title = 'OpenNotes backup') {
  download(new Blob([JSON.stringify(library)], { type: 'application/json' }), `${safeFilename(title)}.opennotes`)
}

export async function importPdf(file: File, progress: (message: string) => void): Promise<Notebook> {
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose a PDF smaller than 30 MB. Split larger files before importing.')
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
    iccUrl: `${import.meta.env.BASE_URL}pdfjs/iccs/`,
  })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 50) throw new Error('This version supports PDF imports up to 50 pages. Split the PDF into smaller documents.')
    const notebook = createNotebook(file.name.replace(/\.pdf$/i, '') || 'Imported PDF', '#4b668c', 'plain')
    notebook.pages = []
    for (let i = 1; i <= pdf.numPages; i++) {
      progress(`Importing PDF · page ${i} of ${pdf.numPages}`)
      const pdfPage = await pdf.getPage(i)
      const original = pdfPage.getViewport({ scale: 1 })
      const ratio = Math.min(1200 / original.width, 1600 / original.height)
      const viewport = pdfPage.getViewport({ scale: ratio })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not allocate a PDF canvas. Close other tabs and try again.')
      await pdfPage.render({ canvasContext: context, canvas, viewport }).promise
      const page = createPage('plain')
      page.width = Math.round(viewport.width)
      page.height = Math.round(viewport.height)
      page.background = canvas.toDataURL('image/jpeg', 0.88)
      notebook.pages.push(page)
      canvas.width = 0
      canvas.height = 0
      pdfPage.cleanup()
    }
    return notebook
  } finally {
    await task.destroy()
  }
}

export async function exportPdf(notebook: Notebook, progress: (message: string) => void) {
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  pdf.setTitle(notebook.title)
  pdf.setCreator('OpenNotes')
  for (const [index, page] of notebook.pages.entries()) {
    progress(`Exporting PDF · page ${index + 1} of ${notebook.pages.length}`)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(page.width * 1.5)
    canvas.height = Math.round(page.height * 1.5)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not allocate an export canvas.')
    context.scale(1.5, 1.5)
    paintPage(context, page, page.background ? await loadImage(page.background) : undefined)
    const image = await pdf.embedPng(canvas.toDataURL('image/png'))
    const output = pdf.addPage([page.width * 0.75, page.height * 0.75])
    output.drawImage(image, { x: 0, y: 0, width: output.getWidth(), height: output.getHeight() })
    canvas.width = 0
    canvas.height = 0
  }
  const bytes = await pdf.save()
  download(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `${safeFilename(notebook.title)}.pdf`)
}
