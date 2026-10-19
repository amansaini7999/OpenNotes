import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importPdfPages } from './files'
import { createPdfPreviewStore } from './pdf-source'
import { backupSchema, createNotebook, emptyLibrary, insertPagesAfter, readBackup } from './model'
import { createSourceAsset } from './assets'

const mocks = vi.hoisted(() => {
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
  const cleanup = vi.fn()
  const getPage = vi.fn(async (_index: number) => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 400 * scale, height: 600 * scale }), render, cleanup }))
  const destroy = vi.fn(async () => undefined)
  return { count: 1000, render, cleanup, getPage, destroy }
})
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({ numPages: mocks.count, getPage: mocks.getPage }), destroy: mocks.destroy }),
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

describe('PDF books and bounded preview decoding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.count = 1000
    const document = { createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => ({}), toDataURL: () => 'data:image/jpeg;base64,YQ==' })) }
    vi.stubGlobal('document', document)
    vi.stubGlobal('window', { document })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('imports exactly 1,000 pages without rasterizing them and preserves the last page in backup validation', async () => {
    const imported = await importPdfPages(new File(['%PDF-1.4'], 'book.pdf'), () => undefined)
    expect(imported.pages).toHaveLength(1000)
    expect(imported.sources).toHaveLength(1)
    expect(imported.sources[0].pageCount).toBe(1000)
    expect(imported.pages[999].source).toEqual({ assetId: imported.sources[0].id, pageIndex: 999 })
    expect(imported.pages.every(page => !page.background)).toBe(true)
    expect(mocks.render).not.toHaveBeenCalled()
    expect(document.createElement).not.toHaveBeenCalled()
    expect(mocks.destroy).toHaveBeenCalledOnce()
    const note = createNotebook('Book and notes')
    const result = insertPagesAfter(note, note.pages[0].id, imported.pages, imported.sources)
    expect(result.pages).toHaveLength(1001)
    const library = { ...emptyLibrary(), notebooks: [result] }
    expect(backupSchema.safeParse(library).success).toBe(true)
    expect(readBackup(JSON.stringify(library)).notebooks[0].pages[1000].source?.pageIndex).toBe(999)
  })
  it('rejects 1,001 PDF pages or insufficient capacity before importing any pages', async () => {
    mocks.count = 1001
    await expect(importPdfPages(new File(['%PDF'], 'large.pdf'), () => undefined)).rejects.toThrow('up to 1,000 pages')
    expect(mocks.getPage).not.toHaveBeenCalled()
    mocks.count = 1000
    await expect(importPdfPages(new File(['%PDF'], 'book.pdf'), () => undefined, 999)).rejects.toThrow('999 more pages')
    expect(mocks.getPage).not.toHaveBeenCalled()
    expect(mocks.destroy).toHaveBeenCalledTimes(2)
  })
  it('reuses a book decoder and keeps only twelve previews, rendering the last page on demand', async () => {
    const store = createPdfPreviewStore()
    const asset = createSourceAsset(new TextEncoder().encode('%PDF'), 'pdf', 1000)
    const signal = new AbortController().signal
    for (let index = 0; index < 13; index++) await store.load(asset, index, signal)
    expect(mocks.render).toHaveBeenCalledTimes(13)
    await store.load(asset, 12, signal)
    expect(mocks.render).toHaveBeenCalledTimes(13)
    await store.load(asset, 0, signal)
    expect(mocks.render).toHaveBeenCalledTimes(14)
    await store.load(asset, 999, signal)
    expect(mocks.getPage).toHaveBeenLastCalledWith(1000)
    await store.close()
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })
  it('skips cancelled requests and does not let a cancelled job poison later previews', async () => {
    const store = createPdfPreviewStore()
    const asset = createSourceAsset(new TextEncoder().encode('%PDF'), 'pdf', 1000)
    const abort = new AbortController()
    const cancelled = store.load(asset, 0, abort.signal)
    abort.abort()
    await expect(cancelled).rejects.toThrow('no longer needed')
    expect(mocks.render).not.toHaveBeenCalled()
    await expect(store.load(asset, 1, new AbortController().signal)).resolves.toContain('data:image/jpeg')
    await store.close()
    await expect(store.load(asset, 2, new AbortController().signal)).rejects.toThrow('no longer needed')
  })
})
