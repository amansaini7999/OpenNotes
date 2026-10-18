import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowDownToLine, BookOpen, Check, CircleHelp, FileUp, HardDrive, Leaf, LoaderCircle, Plus, WifiOff, X } from 'lucide-react'
import { coverColors, createNotebook, mergeBackup, readBackup, type Library, type Notebook, type Template } from './model'
import { exportBackup, exportPdf, importPdf } from './files'
import { useLibrary } from './hooks/useLibrary'
import { usePwa } from './hooks/usePwa'
import { NotebookLibrary } from './components/NotebookLibrary'
import { NotebookEditor } from './components/NotebookEditor'
import { Dialog } from './components/Dialog'
import { InstallApp } from './components/InstallApp'
import { useViewportHeight } from './hooks/useViewportHeight'
import { planBackupRestore, type RestorePlan, type RestoreDecision } from './backup'

type Modal = 'create' | 'help' | 'delete' | null

export default function App() {
  useViewportHeight()
  const { library, status, error: storageError, update, retry } = useLibrary()
  const pwa = usePwa()
  const [activeId, setActiveId] = useState<string | null>(() => new URLSearchParams(location.hash.slice(1)).get('notebook'))
  const [modal, setModal] = useState<Modal>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [restore, setRestore] = useState<{ plan: RestorePlan; imported: Library; decisions: Record<string, RestoreDecision> } | null>(null)
  const [name, setName] = useState('')
  const [cover, setCover] = useState(coverColors[0])
  const [template, setTemplate] = useState<Template>('dotted')
  const fileInput = useRef<HTMLInputElement>(null)
  const active = library?.notebooks.find(note => note.id === activeId)
  const deleting = library?.notebooks.find(note => note.id === deletingId)
  const showError = useCallback((message: string) => setError(message), [])

  useEffect(() => {
    const url = new URL(location.href)
    url.hash = activeId ? new URLSearchParams({ notebook: activeId }).toString() : ''
    history.replaceState(null, '', url)
    document.title = active ? `${active.title} — OpenNotes` : 'OpenNotes — A little room to think'
  }, [activeId, active?.title])

  useEffect(() => {
    if (status !== 'saving' && status !== 'error') return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  const editNotebook = useCallback((change: (notebook: Notebook) => Notebook) => {
    update(value => ({ ...value, notebooks: value.notebooks.map(note => note.id === activeId ? change(note) : note) }))
  }, [update, activeId])

  const runTask = async (label: string, operation: () => Promise<void>) => {
    setBusy(label)
    setError('')
    try { await operation() }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'The operation failed. Please retry.') }
    finally { setBusy('') }
  }

  const importFile = async (file: File) => {
    await runTask('Reading file…', async () => {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const note = await importPdf(file, setBusy)
        update(value => ({ ...value, notebooks: [...value.notebooks, note] }))
        setActiveId(note.id)
      } else {
        if (file.size > 100 * 1024 * 1024) throw new Error('Choose an OpenNotes backup smaller than 100 MB.')
        const imported = readBackup(await file.text())
        if (!library) throw new Error('The library is not ready. Wait for notebooks to load and retry.')
        setRestore({ plan: await planBackupRestore(library, imported), imported, decisions: {} })
      }
    })
  }

  const create = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    const note = createNotebook(name.trim(), cover, template)
    update(value => ({ ...value, notebooks: [...value.notebooks, note] }))
    setModal(null)
    setName('')
    setActiveId(note.id)
  }

  const applyRestore = async (copies: boolean) => {
    if (!restore) return
    const request = restore
    setRestore(null)
    setNotice('')
    await runTask('Restoring notebooks…', async () => {
      const plan = copies ? request.plan : await planBackupRestore(request.plan.base, request.imported, request.decisions)
      if (!copies && plan.reviews.some(review => !request.decisions[review.incomingId])) throw new Error('Some backup versions still need an explicit restore choice. Import the backup again and review them.')
      const saved = await update(value => {
        if (value !== request.plan.base) throw new Error('Notebooks changed while this backup was being reviewed. Import it again to review the latest versions.')
        return copies ? mergeBackup(value, request.imported) : plan.library
      })
      if (!saved) throw new Error('Restore could not be saved on this device. Export a backup of the current in-memory notes and retry saving.')
      setNotice(copies ? 'Imported separate copies as requested.' : `Restore complete: ${plan.added} added, ${plan.updated} updated, ${plan.unchanged} unchanged, ${plan.keptNewer + plan.keptLocal} local versions kept, ${plan.conflicts} copies explicitly requested.`)
    })
  }

  const saveIndicator = <span className={`save-state ${status === 'error' ? 'failed' : ''}`} role="status" data-testid="save-status">
    {status === 'saving' || status === 'loading' ? <LoaderCircle size={14} className="spin" /> : status === 'error' ? <X size={14} /> : <Check size={14} />}
    {status === 'loading' ? 'Opening your workspace' : status === 'saving' ? 'Saving on this device…' : status === 'error' ? 'Not saved — action needed' : 'Saved on this device'}
  </span>

  return <div className={`app-shell ${active ? 'editing' : ''}`}>
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setActiveId(null) }} aria-label="OpenNotes home">
        <span className="brand-mark"><BookOpen size={23} strokeWidth={1.7} /></span><span>Open<span className="brand-light">Notes</span><small>A SPACE FOR YOUR MIND</small></span>
      </a>
      <button className="sidebar-create" aria-label="New notebook" onClick={() => { setName(''); setModal('create') }} disabled={!library || Boolean(busy)}><Plus size={18} /><span>New notebook</span><span className="key-hint" aria-hidden="true">+</span></button>
      <nav aria-label="Main navigation"><span className="nav-label">WORKSPACE</span>
        <button className={`nav-item ${!active ? 'active' : ''}`} onClick={() => setActiveId(null)}><BookOpen size={18} /> All notebooks <span className="nav-count">{library?.notebooks.length ?? 0}</span></button>
        <button className="nav-item" onClick={() => fileInput.current?.click()} disabled={!library || Boolean(busy)}><FileUp size={18} /> Import PDF / backup</button>
        <button className="nav-item" onClick={() => library && exportBackup(library)} disabled={!library}><ArrowDownToLine size={18} /> Back up everything</button>
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-help" onClick={() => setModal('help')}><CircleHelp size={17} /> Help</button>
        <div className="sidebar-signature"><Leaf size={15} /><span>Made for a more open world.</span></div>
      </div>
    </aside>

    <div className="main-column">
      {!active && <div className="status-strip">
        {saveIndicator}
        <div className="status-actions"><span className="connection-state">{!pwa.online ? <><WifiOff size={14} /> Offline</> : <><HardDrive size={14} /> Local-first</>}</span></div>
      </div>}
      {(storageError || error || pwa.registrationError) && <div className="message error" role="alert"><span>{storageError || error || pwa.registrationError}</span>{storageError ? <><button onClick={retry}>Retry save</button><button disabled={!library} onClick={() => library && exportBackup(library)}>Export backup</button></> : error ? <button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button> : <button onClick={() => setModal('help')}>Offline help</button>}</div>}
      {notice && <div className="message notice" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {pwa.updateReady && <div className="message notice"><span>An update is ready. Finish writing and wait for “Saved on this device”, then close all OpenNotes tabs and reopen to update.</span></div>}
      {library ? active ? <NotebookEditor key={active.id} notebook={active} onUpdate={editNotebook} onBack={() => setActiveId(null)} onPdf={() => void runTask('Preparing PDF…', () => exportPdf(active, setBusy))} onError={showError} saveIndicator={saveIndicator} />
        : <NotebookLibrary notebooks={library.notebooks} onOpen={setActiveId} onCreate={() => { setName(''); setModal('create') }} onImport={() => fileInput.current?.click()} onDelete={id => { setDeletingId(id); setModal('delete') }} />
        : <div className="loading-state">{status === 'error' ? <><h1>Your notes need attention.</h1><p>We will not replace unreadable data with an empty library. Use the recovery message above.</p></> : <><LoaderCircle className="spin" size={30} /><p>Making room for your ideas…</p></>}</div>}
    </div>
    <input ref={fileInput} type="file" accept=".pdf,.opennotes,application/pdf,application/json" aria-label="Import PDF or OpenNotes backup" className="visually-hidden" onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) void importFile(file)
    }} />
    {busy && <div className="busy-overlay" role="status" aria-live="polite"><div><LoaderCircle className="spin" size={25} /><strong>{busy}</strong><span>Keep this window open.</span></div></div>}

    {modal === 'create' && <Dialog title="Make room for an idea" onClose={() => setModal(null)}>
      <p className="dialog-intro">A fresh notebook, entirely yours.</p>
      <form onSubmit={create}>
        <label className="field">Notebook name<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Everyday thoughts" /></label>
        <span className="field-label">Cover color</span><div className="cover-choices">{coverColors.map(value => <button key={value} type="button" aria-label={`Cover color ${value}`} aria-pressed={cover === value} className={cover === value ? 'active' : ''} style={{ background: value }} onClick={() => setCover(value)}>{cover === value && <Check size={19} />}</button>)}</div>
        <label className="field">Paper style<select value={template} onChange={event => setTemplate(event.target.value as Template)}><option value="dotted">Dotted — room to think</option><option value="ruled">Ruled — follow your thoughts</option><option value="plain">Plain — a clean slate</option></select></label>
        <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" type="submit" disabled={!name.trim() || !library}><Plus size={17} /> Create notebook</button></div>
      </form>
    </Dialog>}
    {modal === 'delete' && deleting && <Dialog title="Delete this notebook?" onClose={() => setModal(null)}>
      <p>“{deleting.title}” and its {deleting.pages.length} pages will be removed from this device. This cannot be undone. Download a backup first if you may need it.</p>
      <div className="dialog-actions"><button className="secondary" onClick={() => setModal(null)}>Keep notebook</button><button className="danger-button" onClick={() => {
        update(value => ({ ...value, notebooks: value.notebooks.filter(note => note.id !== deleting.id) }))
        if (activeId === deleting.id) setActiveId(null)
        setDeletingId(null)
        setModal(null)
      }}>Delete notebook</button></div>
    </Dialog>}
    {modal === 'help' && <Dialog title="Help" onClose={() => setModal(null)}>
      <div className="help-content">
        <p>{pwa.offlineReady ? 'Ready for offline use.' : 'Keep the app open online until offline setup completes.'}</p>
        <p>Notes are stored in this browser. Clearing site data or storage eviction can delete them. Export editable backups regularly; there is no automatic cloud sync.</p>
        <p>On iPad, swipe left/right with one or two fingers to turn a fitted page. Pinch to zoom; use two fingers to pan when zoomed. Touch navigation pauses during pen input and briefly afterward.</p>
        <div className="document-actions"><InstallApp offlineReady={pwa.offlineReady} /></div>
        <p><a href="https://github.com/amansaini7999/OpenNotes/blob/main/docs/USER_GUIDE.md" target="_blank" rel="noreferrer">User guide and keyboard shortcuts</a></p>
      </div>
    </Dialog>}
        {restore && <Dialog title="Restore backup" onClose={() => setRestore(null)}>
          <p>Stable notebook IDs and SHA-256 content checks prevent duplicate imports.</p>
          <ul className="restore-summary">
            <li>New notebooks: {restore.plan.added}</li>
            <li>Updates from newer backups: {restore.plan.updated}</li>
            <li>Already present: {restore.plan.unchanged}</li>
            <li>Newer local notebooks kept: {restore.plan.keptNewer}</li>
            <li>Versions needing a choice: {restore.plan.reviews.length}</li>
          </ul>
          {restore.plan.reviews.map(review => <label className="field" key={review.incomingId}>
            <strong>{review.title}</strong>
            <span>{review.reason === 'same-timestamp' ? 'The timestamps match, but the contents differ.' : 'The notebook ID differs, but an existing notebook shares its name, ink identifiers, or a saved restore identity.'} A possible match is not permission to overwrite.</span>
            <span>Existing: {review.candidates.map(candidate => candidate.title).join(', ')}</span>
            <select aria-label={`Restore decision for ${review.title}`} value={restore.decisions[review.incomingId] ?? ''} onChange={event => {
              const decision = event.target.value
              if (decision === 'keep-local' || decision === 'replace-local' || decision === 'separate-copy') {
                setRestore(value => value ? { ...value, decisions: { ...value.decisions, [review.incomingId]: decision } } : value)
              }
            }}>
              <option value="" disabled>Choose what to do</option>
              <option value="keep-local">Keep existing local notebook{review.candidates.length > 1 ? 's' : ''}</option>
              {review.candidates.length === 1 && <option value="replace-local">Replace the existing version with this backup</option>}
              <option value="separate-copy">Import this version as a separate copy</option>
            </select>
          </label>)}
          {restore.plan.updated > 0 && <p>Restoring replaces local versions with the newer backup versions. Export a backup first if you need the current local versions.</p>}
          <p>Existing duplicates are not deleted automatically. Import as copies only if you intentionally want duplicates.</p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setRestore(null)}>Cancel</button>
            <button className="secondary" disabled={!restore.imported.notebooks.length} onClick={() => void applyRestore(true)}>Import as separate copies</button>
            <button className="primary" disabled={restore.plan.reviews.some(review => !restore.decisions[review.incomingId])} onClick={() => void applyRestore(false)}>Restore notebooks</button>
      </div>
    </Dialog>}
  </div>
}
