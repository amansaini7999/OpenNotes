import { useCallback, useEffect, useRef, useState } from 'react'
import type { Library } from '../model'
import { createStorage } from '../storage'

type SaveStatus = 'loading' | 'saving' | 'saved' | 'error'
type LibraryUpdate = (library: Library) => Library

export function useLibrary() {
  const [library, setLibrary] = useState<Library | null>(null)
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [error, setError] = useState('')
  const current = useRef<Library | null>(null)
  const storage = useRef<ReturnType<typeof createStorage> | null>(null)
  const revision = useRef(0)

  useEffect(() => {
    let mounted = true
    let release: (() => void) | undefined
    const failure = (cause: unknown) => {
      if (!mounted) return
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'Local storage could not be opened.')
    }
    if (!navigator.locks) {
      failure(new Error('This browser cannot safely coordinate local editing. Use a current Chrome or Safari on localhost or HTTPS.'))
      return
    }
    void navigator.locks.request('opennotes-writer', { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('OpenNotes is already open in another tab or window. Close it there, then reload this window to avoid overwriting notes.')
      const held = new Promise<void>(resolve => { release = resolve })
      const db = createStorage()
      storage.current = db
      try {
        const value = await db.load()
        if (!mounted) return
        current.current = value
        setLibrary(value)
        setStatus('saved')
        await held
      } finally {
        await db.close()
      }
    }).catch(failure)
    return () => { mounted = false; release?.() }
  }, [])

  const save = useCallback((value: Library) => {
    const db = storage.current
    if (!db) throw new Error('Local storage is not ready; editing is unavailable.')
    const version = ++revision.current
    setStatus('saving')
    return db.save(value).then(() => {
      if (revision.current === version) {
        setError('')
        setStatus('saved')
      }
      return true
    }).catch((cause: unknown) => {
      setStatus('error')
      setError(`Changes are not saved. ${cause instanceof Error ? cause.message : 'Local storage failed.'} Export a backup now, then retry.`)
      return false
    })
  }, [])

  const update = useCallback((change: LibraryUpdate) => {
    if (!current.current) throw new Error('Notebooks are not loaded; editing is unavailable.')
    const next = change(current.current)
    current.current = next
    setLibrary(next)
    return save(next)
  }, [save])

  const retry = useCallback(() => {
    if (current.current) save(current.current)
    else location.reload()
  }, [save])

  return { library, status, error, update, retry }
}
