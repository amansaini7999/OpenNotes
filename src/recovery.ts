import { openDB } from 'idb'
import type { NotesDB } from './storage'
import type { SourceAsset } from './model'

export const PDF_SESSION_KEY = 'opennotes-pdf-session'
const QUARANTINE_KEY = 'opennotes-quarantined-notebooks'

export function quarantinedNotebookIds(): string[] {
  const stored = localStorage.getItem(QUARANTINE_KEY)
  if (!stored) return []
  const value: unknown = JSON.parse(stored)
  if (!Array.isArray(value) || !value.every(id => typeof id === 'string')) throw new Error('The recovery exclusion list could not be read. Export notebooks from recovery before changing browser data.')
  return value
}

export function setNotebookQuarantined(id: string, excluded: boolean) {
  const ids = new Set(quarantinedNotebookIds())
  if (excluded) ids.add(id)
  else ids.delete(id)
  localStorage.setItem(QUARANTINE_KEY, JSON.stringify([...ids]))
}

async function recoveryDatabase(name: string) {
  const db = await openDB<NotesDB>(name, undefined, { upgrade(_db, _old, _version, tx) {
    // The open request reports the abort; also consume the transaction's rejection.
    void tx.done.then(() => undefined, () => undefined)
    tx.abort()
  } }).catch((cause: unknown) => {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw new Error('No existing OpenNotes database could be opened. Use the same browser and app address as your saved notes.', { cause })
    throw cause
  })
  if (!db.objectStoreNames.contains('notebooks') || !db.objectStoreNames.contains('pages')) {
    db.close()
    throw new Error('No readable OpenNotes notebook database was found at this address. Use the same browser and app origin as your notes.')
  }
  return db
}

export async function recoveryIndex(name = 'opennotes-v1') {
  const db = await recoveryDatabase(name)
  try {
    const records = await db.getAll('notebooks')
    if (records.some(record => !record || typeof record.id !== 'string' || typeof record.title !== 'string' ||
      !Array.isArray(record.pageIds) || !record.pageIds.every(id => typeof id === 'string') ||
      (record.sourceIds !== undefined && (!Array.isArray(record.sourceIds) || !record.sourceIds.every(id => typeof id === 'string'))))) {
      throw new Error('Some saved notebook metadata is unreadable. Nothing has been changed. Do not clear website data; retain this browser storage for recovery.')
    }
    return records
  } finally { db.close() }
}

export async function recoveryNotebookBackup(id: string, progress: (message: string) => void, name = 'opennotes-v1'): Promise<Blob> {
  const db = await recoveryDatabase(name)
  try {
    const record = await db.get('notebooks', id)
    if (!record) throw new Error('This notebook record is missing. Nothing has been deleted or replaced.')
    const { pageIds, sourceIds = [], ...metadata } = record
    const folders = db.objectStoreNames.contains('folders') ? await db.getAll('folders') : []
    const parts: BlobPart[] = ['{"format":"opennotes","version":1,"folders":', JSON.stringify(folders), ',"notebooks":[', JSON.stringify(metadata).slice(0, -1), ',"pages":[']
    for (let offset = 0; offset < pageIds.length; offset += 32) {
      progress(`Reading pages ${offset + 1}–${Math.min(offset + 32, pageIds.length)} of ${pageIds.length}…`)
      const ids = pageIds.slice(offset, offset + 32)
      const tx = db.transaction(['pages', 'images'])
      const pages = await Promise.all(ids.map(async pageId => {
        const [page, background] = await Promise.all([tx.objectStore('pages').get(pageId), tx.objectStore('images').get(pageId)])
        if (!page) throw new Error(`A saved page is missing from "${record.title}". The notebook has not been changed.`)
        return { ...page, ...(background ? { background } : {}) }
      }))
      await tx.done
      pages.forEach((page, index) => { if (offset || index) parts.push(','); parts.push(JSON.stringify(page)) })
    }
    parts.push('],"sources":[')
    for (let index = 0; index < sourceIds.length; index++) {
      progress(`Reading original file ${index + 1} of ${sourceIds.length}…`)
      const source = await db.get('assets', sourceIds[index])
      if (!source || typeof source.data !== 'string') throw new Error('An original source file is missing or unreadable. The notebook has not been changed.')
      if (index) parts.push(',')
      const { data, ...asset } = source
      parts.push(JSON.stringify(asset).slice(0, -1), ',"data":"')
      for (let offset = 0; offset < data.length; offset += 65536) parts.push(JSON.stringify(data.slice(offset, offset + 65536)).slice(1, -1))
      parts.push('"}')
    }
    parts.push(']}]}')
    return new Blob(parts, { type: 'application/json' })
  } finally { db.close() }
}

export async function recoveryOriginal(id: string, name = 'opennotes-v1'): Promise<{ blob: Blob; extension: string }> {
  const db = await recoveryDatabase(name)
  try {
    const source: SourceAsset | undefined = await db.get('assets', id)
    if (!source || typeof source.data !== 'string') throw new Error('The original file is missing or unreadable. Nothing has been changed.')
    const extensions: Record<SourceAsset['mime'], string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
    const extension = Object.hasOwn(extensions, source.mime) ? extensions[source.mime] : undefined
    if (!extension) throw new Error('The saved source format could not be identified. Export an editable notebook backup instead.')
    const parts: BlobPart[] = []
    for (let offset = 0; offset < source.data.length; offset += 65536) {
      parts.push(Uint8Array.from(atob(source.data.slice(offset, offset + 65536)), character => character.charCodeAt(0)))
    }
    return { blob: new Blob(parts, { type: source.mime }), extension }
  } finally { db.close() }
}
