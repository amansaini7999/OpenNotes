import { describe, expect, it, vi } from 'vitest'
import { deleteDB, openDB } from 'idb'
import { createNotebook, emptyLibrary } from './model'
import { createStorage } from './storage'

describe('durable local storage', () => {
  it('rolls back a partially scheduled write and permits a later retry', async () => {
    const name = crypto.randomUUID(), store = createStorage(name)
    const original = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'pages') throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return original.call(this, value, key)
    })
    const library = { ...emptyLibrary(), notebooks: [createNotebook('Recoverable')] }
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
