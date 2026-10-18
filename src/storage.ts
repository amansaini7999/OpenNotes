import { openDB, type DBSchema } from 'idb'
import { backupSchema, emptyLibrary, type Library, type Notebook, type NotePage } from './model'

interface NotesDB extends DBSchema {
  notebooks: { key: string; value: Omit<Notebook, 'pages'> & { pageIds: string[] } }
  pages: { key: string; value: Omit<NotePage, 'background'> }
  images: { key: string; value: string }
}

export function createStorage(name = 'opennotes-v1') {
  const database = openDB<NotesDB>(name, 1, {
    upgrade(db) {
      db.createObjectStore('notebooks')
      db.createObjectStore('pages')
      db.createObjectStore('images')
    },
    blocking(_current, _blocked, event) { (event.target as IDBDatabase).close() },
  })
  let queue: Promise<void> = Promise.resolve()
  let persisted = emptyLibrary()
  return {
    async load(): Promise<Library> {
      const db = await database
      const tx = db.transaction(['notebooks', 'pages', 'images'], 'readonly')
      const records = await tx.objectStore('notebooks').getAll()
      const notebooks = await Promise.all(records.map(async ({ pageIds, ...record }) => ({
        ...record,
        pages: await Promise.all(pageIds.map(async id => {
          const [page, background] = await Promise.all([
            tx.objectStore('pages').get(id),
            tx.objectStore('images').get(id),
          ])
          if (!page) throw new Error('A saved page is missing. Do not clear site data; recover from an exported backup.')
          return { ...page, ...(background ? { background } : {}) }
        })),
      })))
      await tx.done
      const result = backupSchema.safeParse({ ...emptyLibrary(), notebooks })
      if (!result.success) throw new Error('Saved data could not be read. Do not clear site data; recover an exported backup or contact support.')
      persisted = result.data
      return result.data
    },
    save(library: Library): Promise<void> {
      // Callers use immutable updates. Only changed page records are written; PDF images stay separate.
      const write = queue.then(async () => {
        const db = await database
        const tx = db.transaction(['notebooks', 'pages', 'images'], 'readwrite', { durability: 'strict' })
        const operations: Promise<unknown>[] = []
        try {
        const remaining = new Set(library.notebooks.map(note => note.id))
        for (const old of persisted.notebooks) {
          if (remaining.has(old.id)) continue
          operations.push(tx.objectStore('notebooks').delete(old.id))
          for (const page of old.pages) {
            operations.push(tx.objectStore('pages').delete(page.id), tx.objectStore('images').delete(page.id))
          }
        }
        for (const note of library.notebooks) {
          const old = persisted.notebooks.find(value => value.id === note.id)
          if (old === note) continue
          const { pages, ...metadata } = note
          operations.push(tx.objectStore('notebooks').put({ ...metadata, pageIds: pages.map(page => page.id) }, note.id))
          const pageIds = new Set(pages.map(page => page.id))
          for (const previous of old?.pages ?? []) {
            if (!pageIds.has(previous.id)) {
              operations.push(tx.objectStore('pages').delete(previous.id), tx.objectStore('images').delete(previous.id))
            }
          }
          for (const page of pages) {
            const previous = old?.pages.find(value => value.id === page.id)
            if (previous === page) continue
            const { background, ...ink } = page
            operations.push(tx.objectStore('pages').put(ink, page.id))
            if (previous?.background !== background) {
              if (background) operations.push(tx.objectStore('images').put(background, page.id))
              else operations.push(tx.objectStore('images').delete(page.id))
            }
          }
        }
        } catch (cause: unknown) {
          tx.abort()
          await Promise.allSettled([...operations, tx.done])
          throw cause
        }
        await Promise.all([...operations, tx.done])
        persisted = library
      })
      // A failed transaction must be reported to its caller, without poisoning later retries.
      queue = write.then(() => undefined, () => undefined)
      return write
    },
    async close() { await queue; (await database).close() },
  }
}
