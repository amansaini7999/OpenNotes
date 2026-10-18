import { createNotebook, createPage, safeFilename, type Library, type Notebook, type NotePage, type ImportedPages } from './model'
import { loadImage } from './render'
import { createSourceAsset } from './assets'

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
  const imported = await importPdfPages(file, progress)
  return { ...createNotebook(file.name.replace(/\.pdf$/i, '') || 'Imported PDF', '#4b668c', 'plain'), ...imported }
}

export async function importPdfPages(file: File, progress: (message: string) => void, availablePages = 50): Promise<ImportedPages> {
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose a PDF smaller than 30 MB. Split larger files before importing.')
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const bytes = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
    iccUrl: `${import.meta.env.BASE_URL}pdfjs/iccs/`,
  })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 50) throw new Error('This version supports PDF imports up to 50 pages. Split the PDF into smaller documents.')
    if (pdf.numPages > availablePages) throw new Error(`Not enough page capacity for this PDF. You can insert ${availablePages} more pages in this operation.`)
    const source = createSourceAsset(bytes, 'pdf', pdf.numPages)
    const pages: NotePage[] = []
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
      page.source = { assetId: source.id, pageIndex: i - 1 }
      pages.push(page)
      canvas.width = 0
      canvas.height = 0
      pdfPage.cleanup()
    }
    return { pages, sources: [source] }
  } finally {
    await task.destroy()
  }
}

async function importImagePage(file: File): Promise<ImportedPages> {
  if (file.size > 20 * 1024 * 1024) throw new Error(`"${file.name}" is larger than 20 MB. Resize the image before importing.`)
  if (!/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error(`"${file.name}" is not supported. Choose PNG, JPEG, WebP images or a PDF.`)
  const url = URL.createObjectURL(file)
  try {
    let image: HTMLImageElement
    try { image = await loadImage(url) }
    catch (cause: unknown) { throw new Error(`"${file.name}" could not be decoded. Choose a valid PNG, JPEG or WebP image.`, { cause }) }
    const source = createSourceAsset(new Uint8Array(await file.arrayBuffer()), 'image')
    const ratio = Math.min(1200 / image.naturalWidth, 1600 / image.naturalHeight, 1)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(100, Math.round(image.naturalWidth * ratio))
    canvas.height = Math.max(100, Math.round(image.naturalHeight * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not allocate an image canvas. Close other tabs and try again.')
    try {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
      return {
        pages: [{ ...createPage('plain'), width: canvas.width, height: canvas.height, background: canvas.toDataURL('image/jpeg', 0.9), source: { assetId: source.id, pageIndex: 0 } }],
        sources: [source],
      }
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function importPageFiles(files: File[], availablePages: number, progress: (message: string) => void): Promise<ImportedPages> {
  if (!files.length) throw new Error('Select at least one image or PDF.')
  if (files.length > 50 || files.reduce((size, file) => size + file.size, 0) > 100 * 1024 * 1024) {
    throw new Error('Insert up to 50 files and 100 MB at a time.')
  }
  const limit = Math.min(50, availablePages)
  if (limit < files.length) throw new Error('Not enough page capacity. Select fewer files or use another notebook.')
  const pages: NotePage[] = []
  const sources: ImportedPages['sources'] = []
  for (const file of files) {
    progress(`Reading ${file.name}…`)
    const imported = /\.pdf$/i.test(file.name)
      ? await importPdfPages(file, progress, limit - pages.length)
      : await importImagePage(file)
    if (pages.length + imported.pages.length > limit) throw new Error(`Insert up to ${limit} pages in this operation. No pages have been added.`)
    pages.push(...imported.pages)
    sources.push(...imported.sources)
  }
  return { pages, sources }
}

export async function exportPdf(notebook: Notebook, progress: (message: string) => void) {
  const { buildNotebookPdf } = await import('./pdf')
  const bytes = await buildNotebookPdf(notebook, progress)
  download(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `${safeFilename(notebook.title)}.pdf`)
}
