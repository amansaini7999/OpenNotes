import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteDB, openDB } from 'idb'
import { createStorage } from './storage'
import { createNotebook, createPage, emptyLibrary, readBackup } from './model'
import { createSourceAsset, isBase64 } from './assets'
import { quarantinedNotebookIds, recoveryIndex, recoveryNotebookBackup, recoveryOriginal, setNotebookQuarantined } from './recovery'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function fixture() {
  const name = crypto.randomUUID(), store = createStorage(name)
  const book = createNotebook('Problem book')
  const bytes = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256)
  const source = createSourceAsset(bytes, 'pdf', 600)
  book.sources = [source]
  book.pages = Array.from({ length: 600 }, (_, index) => ({ ...createPage('plain'), source: { assetId: source.id, pageIndex: index } }))
  book.pages[599].strokes = [{ id: crypto.randomUUID(), tool: 'pen', color: '#253a43', width: 3, points: [{ x: 20, y: 20, pressure: 0.5 }] }]
  const healthy = createNotebook('Healthy notes')
  await store.save({ ...emptyLibrary(), notebooks: [book, healthy] })
  await store.close()
  return { name, book, healthy, bytes }
}

describe('non-destructive recovery', () => {
  it('lists only metadata without loading source files, pages or background previews', async () => {
    const { name, book } = await fixture()
    const original = IDBObjectStore.prototype.getAll
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name !== 'notebooks') throw new Error('Heavy record read during recovery startup')
      return original.apply(this, args)
    })
    expect((await recoveryIndex(name)).find(note => note.id === book.id)?.pageIds).toHaveLength(600)
    await deleteDB(name)
  })
  it('exports a full editable backup and original bytes without PDF decoding', async () => {
    const { name, book, bytes } = await fixture()
    const recovered = readBackup(await (await recoveryNotebookBackup(book.id, () => undefined, name)).text())
    expect(recovered.notebooks).toEqual([book])
    const original = await recoveryOriginal(book.sources[0].id, name)
    expect(original.extension).toBe('pdf')
    expect(new Uint8Array(await original.blob.arrayBuffer())).toEqual(bytes)
    await deleteDB(name)
  })
  it('excludes a problem notebook from loading and leaves all its records untouched when healthy notes are saved', async () => {
    const { name, book, healthy } = await fixture()
    const store = createStorage(name)
    const original = IDBObjectStore.prototype.getAll
    const spy = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'assets' || this.name === 'pages' || this.name === 'images') throw new Error('An excluded store was bulk-loaded')
      return original.apply(this, args)
    })
    const get = vi.spyOn(IDBObjectStore.prototype, 'get')
    const loaded = await store.load(new Set([book.id]))
    expect(loaded.notebooks).toEqual([healthy])
    expect(get.mock.calls.some(args => args[0] === book.sources[0].id || book.pages.some(page => page.id === args[0]))).toBe(false)
    await store.save({ ...loaded, notebooks: [{ ...healthy, title: 'Healthy edit' }] })
    await store.close()
    spy.mockRestore()
    const all = createStorage(name)
    const restored = await all.load()
    expect(restored.notebooks.find(note => note.id === book.id)).toEqual(book)
    expect(restored.notebooks.find(note => note.id === healthy.id)?.title).toBe('Healthy edit')
    await all.close()
    await deleteDB(name)
  })
  it('reports missing records instead of exporting success-shaped partial backups', async () => {
    const { name, book } = await fixture()
    const db = await openDB(name)
    await db.delete('pages', book.pages[10].id)
    await expect(recoveryNotebookBackup(book.id, () => undefined, name)).rejects.toThrow('saved page is missing')
    expect(await db.get('notebooks', book.id)).toBeDefined()
    db.close()
    await deleteDB(name)
  })
  it('does not create an empty replacement database when recovery is opened at the wrong origin', async () => {
    const name = crypto.randomUUID()
    await expect(recoveryIndex(name)).rejects.toThrow()
    expect((await indexedDB.databases()).some(db => db.name === name)).toBe(false)
  })
  it('keeps recovery exclusions reversible and rejects corrupt preferences explicitly', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
    setNotebookQuarantined('book', true)
    expect(quarantinedNotebookIds()).toEqual(['book'])
    setNotebookQuarantined('book', false)
    expect(quarantinedNotebookIds()).toEqual([])
    values.set('opennotes-quarantined-notebooks', '{"bad":true}')
    expect(() => quarantinedNotebookIds()).toThrow('could not be read')
  })
  it('validates multi-megabyte base64 sources in bounded chunks without accepting embedded invalid characters', () => {
    const data = 'YWJj'.repeat(1_000_000)
    expect(isBase64(data)).toBe(true)
    expect(isBase64(`${data}=x`)).toBe(false)
    expect(isBase64('YWJj===')).toBe(false)
    expect(isBase64('')).toBe(false)
    expect(isBase64('YQ==')).toBe(true)
  })
})
