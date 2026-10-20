import { useEffect, useState } from 'react'
import { download } from '../files'
import { safeFilename } from '../model'
import { PDF_SESSION_KEY, quarantinedNotebookIds, recoveryIndex, recoveryNotebookBackup, recoveryOriginal, setNotebookQuarantined } from '../recovery'

export default function RecoveryApp() {
  const [notebooks, setNotebooks] = useState<Awaited<ReturnType<typeof recoveryIndex>> | null>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let mounted = true
    void recoveryIndex().then(value => { if (mounted) setNotebooks(value) }).catch((cause: unknown) => {
      if (mounted) setError(cause instanceof Error ? cause.message : 'Saved notebook metadata could not be read.')
    })
    try { setExcluded(quarantinedNotebookIds()) }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Recovery preferences could not be read.') }
    return () => { mounted = false }
  }, [])
  const run = async (operation: () => Promise<void>) => {
    setError(''); setNotice(''); setBusy('Preparing recovery download…')
    try {
      if (!navigator.locks) throw new Error('This browser cannot coordinate a consistent recovery export. Use a current browser at the same app address.')
      await navigator.locks.request('opennotes-writer', { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Close the other OpenNotes editing window before exporting. Recovery will not export a notebook while another window could be changing it.')
        await operation()
      })
      setNotice('Download requested. Check that the file is saved before removing or clearing any browser data.')
    }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Recovery export failed. Your saved data has not been changed.') }
    finally { setBusy('') }
  }
  return <main className="recovery-library">
    <h1>Recover your OpenNotes library</h1>
    <p>PDF decoding and automatic notebook opening are disabled here. Reading this list does not load original PDFs or page previews.</p>
    <p>This screen also opens when a previous large-book session did not close cleanly. It does not mean that your saved notes were deleted.</p>
    <p><strong>Do not uninstall the app or clear website data.</strong> Export important notebooks first. An original PDF download does not include your handwriting; use an editable backup to preserve notes.</p>
    {error && <p className="message error" role="alert">{error}</p>}
    {notice && <p className="message notice" role="status">{notice}</p>}
    {busy && <p role="status">{busy} Keep this window open.</p>}
    {notebooks === null && !error && <p>Reading notebook metadata…</p>}
    {notebooks?.length === 0 && <p>No notebooks were found in this browser. Try the browser and app address where you created your notes.</p>}
    {notebooks?.map(note => <section className="recovery-notebook" key={note.id}>
      <h2>{note.title}</h2><p>{note.pageIds.length} pages{excluded.includes(note.id) ? ' · Kept out of the normal library' : ''}</p>
      <div className="document-actions">
        <button className="primary" disabled={Boolean(busy)} onClick={() => void run(async () => {
          const backup = await recoveryNotebookBackup(note.id, setBusy)
          download(backup, `${safeFilename(note.title)}.opennotes`)
        })}>Download editable backup of {note.title}</button>
        {(note.sourceIds ?? []).map((id, index) => <button className="secondary" disabled={Boolean(busy)} key={id} onClick={() => void run(async () => {
          const original = await recoveryOriginal(id)
          download(original.blob, `${safeFilename(note.title)}-original-${index + 1}.${original.extension}`)
        })}>Download original file {index + 1} from {note.title}</button>)}
        <button className="secondary" disabled={Boolean(busy)} onClick={() => {
          try {
            setNotebookQuarantined(note.id, !excluded.includes(note.id))
            setExcluded(quarantinedNotebookIds())
            setNotice('Recovery exclusion updated. No notebook, page, original file or handwriting was deleted. Changes apply when you reopen the library.')
          } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'The recovery preference could not be saved.') }
        }}>{excluded.includes(note.id) ? `Restore ${note.title} to library` : `Keep ${note.title} out of library`}</button>
      </div>
    </section>)}
    <a className="secondary" href={import.meta.env.BASE_URL} onClick={event => {
      event.preventDefault()
      if (busy) { setError('Wait for the recovery export to finish before returning to the library.'); return }
      if (!navigator.locks) { setError('This browser cannot coordinate safely with other OpenNotes windows. Use a current browser at the same app address.'); return }
      void navigator.locks.request('opennotes-writer', { ifAvailable: true }, lock => {
        if (!lock) throw new Error('Close the other OpenNotes editing window before returning to this library.')
        localStorage.removeItem(PDF_SESSION_KEY)
        location.assign(import.meta.env.BASE_URL)
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'The interrupted-book marker could not be cleared.'))
    }}>Return to library</a>
    <p>Keeping a notebook out of the library is reversible. It remains stored on this device and can be exported or restored from this screen.</p>
  </main>
}
