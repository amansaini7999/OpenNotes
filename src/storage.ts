import { openDB, type DBSchema } from 'idb'
import { backupSchema, emptyLibrary, type Folder, type Library, type Notebook, type NotePage, type SourceAsset } from './model'

interface NotesDB extends DBSchema {
  notebooks: { key: string; value: Omit<Notebook, 'pages' | 'sources'> & { pageIds: string[]; sourceIds?: string[] } }
  pages: { key: string; value: Omit<NotePage, 'background'> }
  images: { key: string; value: string }
  assets: { key: string; value: SourceAsset }
  folders: { key: string; value: Folder }
}

export function createStorage(name = 'opennotes-v1') {
  const database = openDB<NotesDB>(name, 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('notebooks')) db.createObjectStore('notebooks')
      if (!db.objectStoreNames.contains('pages')) db.createObjectStore('pages')
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images')
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets')
      if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders')
    },
    blocking(_current, _blocked, event) { (event.target as IDBDatabase).close() },
  })
  let queue: Promise<void> = Promise.resolve()
  let persisted = emptyLibrary()
  return {
    async load(): Promise<Library> {
      const db = await database
      const tx = db.transaction(['notebooks', 'pages', 'images', 'assets', 'folders'], 'readonly')
      const folders = await tx.objectStore('folders').getAll()
      const records = await tx.objectStore('notebooks').getAll()
      const notebooks = await Promise.all(records.map(async ({ pageIds, sourceIds = [], ...record }) => ({
        ...record,
        sources: await Promise.all(sourceIds.map(async id => {
          const asset = await tx.objectStore('assets').get(id)
          if (!asset) throw new Error('An original source file is missing. Do not clear site data; recover an editable backup.')
          return asset
        })),
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
      const result = backupSchema.safeParse({ ...emptyLibrary(), folders, notebooks })
      if (!result.success) throw new Error('Saved data could not be read. Do not clear site data; recover an exported backup or contact support.')
      persisted = result.data
      return result.data
    },
    save(library: Library): Promise<void> {
      // Callers use immutable updates. Only changed page records are written; PDF images stay separate.
      const write = queue.then(async () => {
        const db = await database
        const tx = db.transaction(['notebooks', 'pages', 'images', 'assets', 'folders'], 'readwrite', { durability: 'strict' })
        const operations: Promise<unknown>[] = []
        try {
        const folderIds = new Set(library.folders.map(folder => folder.id))
        for (const old of persisted.folders) {
          if (!folderIds.has(old.id)) operations.push(tx.objectStore('folders').delete(old.id))
        }
        for (const folder of library.folders) {
          if (persisted.folders.find(value => value.id === folder.id) !== folder) operations.push(tx.objectStore('folders').put(folder, folder.id))
        }
        const remaining = new Set(library.notebooks.map(note => note.id))
        for (const old of persisted.notebooks) {
          if (remaining.has(old.id)) continue
          operations.push(tx.objectStore('notebooks').delete(old.id))
          for (const asset of old.sources) operations.push(tx.objectStore('assets').delete(asset.id))
          for (const page of old.pages) {
            operations.push(tx.objectStore('pages').delete(page.id), tx.objectStore('images').delete(page.id))
          }
        }
        for (const note of library.notebooks) {
          const old = persisted.notebooks.find(value => value.id === note.id)
          if (old === note) continue
          const { pages, sources, ...metadata } = note
          operations.push(tx.objectStore('notebooks').put({ ...metadata, pageIds: pages.map(page => page.id), sourceIds: sources.map(asset => asset.id) }, note.id))
          for (const asset of sources) {
            if (old?.sources.find(value => value.id === asset.id) !== asset) operations.push(tx.objectStore('assets').put(asset, asset.id))
          }
          const sourceIds = new Set(sources.map(asset => asset.id))
          for (const asset of old?.sources ?? []) {
            if (!sourceIds.has(asset.id)) operations.push(tx.objectStore('assets').delete(asset.id))
          }
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
