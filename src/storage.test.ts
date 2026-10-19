import { describe, expect, it, vi } from 'vitest'
import { deleteDB, openDB } from 'idb'
import { createNotebook, emptyLibrary } from './model'
import { addFolder, deleteFolder, moveNotebook } from './folders'
import { createStorage } from './storage'
import { createSourceAsset, decodeBase64 } from './assets'

describe('durable local storage', () => {
  it('upgrades version two and persists nested folders, moves and safe deletions across reopening', async () => {
    const name = crypto.randomUUID()
    const db = await openDB(name, 2, { upgrade(db) {
      for (const store of ['notebooks', 'pages', 'images', 'assets']) db.createObjectStore(store)
    } })
    const note = createNotebook('Before folders')
    const asset = createSourceAsset(decodeBase64('JVBERi0xLjQ='), 'pdf')
    note.sources = [asset]
    note.pages[0].source = { assetId: asset.id, pageIndex: 0 }
    const { pages, sources, ...metadata } = note
    await db.put('notebooks', { ...metadata, pageIds: pages.map(page => page.id), sourceIds: sources.map(source => source.id) }, note.id)
    await db.put('pages', pages[0], pages[0].id)
    await db.put('assets', asset, asset.id)
    db.close()
    const store = createStorage(name)
    const old = await store.load()
    expect(old.folders).toEqual([])
    expect(old.notebooks[0]).toEqual(note)
    let next = addFolder(old, 'UPSC')
    next = addFolder(next, 'History', next.folders[0].id)
    next = moveNotebook(next, note.id, next.folders[1].id)
    await store.save(next)
    await store.close()
    const reopened = createStorage(name)
    const loaded = await reopened.load()
    expect(loaded.folders).toHaveLength(2)
    expect(loaded).toEqual({ ...next, folders: expect.arrayContaining(next.folders) })
    const removed = deleteFolder(next, next.folders[1].id)
    await reopened.save(removed)
    expect(await reopened.load()).toEqual(removed)
    expect(removed.notebooks[0].sources).toEqual([asset])
    await reopened.close()
    await deleteDB(name)
  })
  it('upgrades a version-one library without losing notebooks or background images', async () => {
    const name = crypto.randomUUID()
    const old = await openDB(name, 1, { upgrade(db) {
      db.createObjectStore('notebooks'); db.createObjectStore('pages'); db.createObjectStore('images')
    } })
    const note = createNotebook('Before upgrade')
    const { pages, sources: _sources, ...metadata } = note
    await old.put('notebooks', { ...metadata, pageIds: pages.map(page => page.id) }, note.id)
    await old.put('pages', pages[0], pages[0].id)
    await old.put('images', 'data:image/jpeg;base64,YQ==', pages[0].id)
    old.close()
    const store = createStorage(name)
    const upgraded = await store.load()
    expect(upgraded.notebooks[0].title).toBe('Before upgrade')
    expect(upgraded.notebooks[0].pages[0].background).toBe('data:image/jpeg;base64,YQ==')
    expect(upgraded.notebooks[0].sources).toEqual([])
    await store.close()
    await deleteDB(name)
  })
  it('stores one original source separately from its page previews and removes it on notebook deletion', async () => {
    const name = crypto.randomUUID(), store = createStorage(name)
    const note = createNotebook('Original')
    const asset = createSourceAsset(decodeBase64('JVBERi0xLjQ='), 'pdf')
    note.sources = [asset]
    note.pages[0].source = { assetId: asset.id, pageIndex: 0 }
    await store.save({ ...emptyLibrary(), notebooks: [note] })
    expect((await store.load()).notebooks[0].sources[0].data).toBe(asset.data)
    const db = await openDB(name)
    expect(await db.count('assets')).toBe(1)
    await store.save(emptyLibrary())
    expect(await db.count('assets')).toBe(0)
    db.close()
    await store.close()
    await deleteDB(name)
  })
  it('rolls back a partially scheduled write and permits a later retry', async () => {
    const name = crypto.randomUUID(), store = createStorage(name)
    const original = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'pages') throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return original.call(this, value, key)
    })
    const library = addFolder({ ...emptyLibrary(), notebooks: [createNotebook('Recoverable')] }, 'Recoverable folder')
    try {
      await expect(store.save(library)).rejects.toThrow('Quota exceeded')
    } finally { put.mockRestore() }
    expect(await store.load()).toEqual(emptyLibrary())
    await store.save(library)
    expect((await store.load()).notebooks[0].title).toBe('Recoverable')
    await store.close()
    await deleteDB(name)
  })
  it('opens a new library without inserting fake user content', async () => {
    const store = createStorage(crypto.randomUUID())
    expect(await store.load()).toEqual(emptyLibrary())
    await store.close()
  })
  it('serializes rapid saves and survives reopening', async () => {
    const name = crypto.randomUUID(), store = createStorage(name)
    const note = createNotebook('First title')
    const first = { ...emptyLibrary(), notebooks: [note] }
    const second = { ...first, notebooks: [{ ...note, title: 'Latest title' }] }
    await Promise.all([store.save(first), store.save(second)])
    await store.close()
    const reopened = createStorage(name)
    expect((await reopened.load()).notebooks[0].title).toBe('Latest title')
    await reopened.close()
    await deleteDB(name)
  })
  it('preserves PDF backgrounds across ink updates and removes deleted records', async () => {
    const name = crypto.randomUUID(), store = createStorage(name)
    const note = createNotebook('PDF')
    note.pages[0].background = 'data:image/jpeg;base64,YQ=='
    await store.save({ ...emptyLibrary(), notebooks: [note] })
    const next = { ...note, pages: [{ ...note.pages[0], template: 'plain' as const }] }
    await store.save({ ...emptyLibrary(), notebooks: [next] })
    expect((await store.load()).notebooks[0].pages[0].background).toBe(note.pages[0].background)
    await store.save(emptyLibrary())
    expect((await store.load()).notebooks).toEqual([])
    const db = await openDB(name)
    expect(await db.count('images')).toBe(0)
    expect(await db.count('pages')).toBe(0)
    db.close()
    await store.close()
    await deleteDB(name)
  })
  it('rejects corrupted saved data instead of presenting an empty success', async () => {
    const name = crypto.randomUUID(), store = createStorage(name)
    await store.load()
    const db = await openDB(name)
    await db.put('notebooks', { title: 'Broken', pageIds: ['missing'] }, 'broken')
    await expect(store.load()).rejects.toThrow('saved page is missing')
    db.close()
    await store.close()
    await deleteDB(name)
  })
})
