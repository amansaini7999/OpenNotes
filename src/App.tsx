import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowDownToLine, BookOpen, Check, CircleHelp, FileUp, HardDrive, Leaf, LoaderCircle, Plus, ShieldCheck, WifiOff, X } from 'lucide-react'
import { coverColors, createNotebook, mergeBackup, readBackup, type Notebook, type Template } from './model'
import { exportBackup, exportPdf, importPdf } from './files'
import { useLibrary } from './hooks/useLibrary'
import { usePwa } from './hooks/usePwa'
import { NotebookLibrary } from './components/NotebookLibrary'
import { NotebookEditor } from './components/NotebookEditor'
import { Dialog } from './components/Dialog'
import { InstallApp } from './components/InstallApp'
import { useViewportHeight } from './hooks/useViewportHeight'

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
  const [name, setName] = useState('')
  const [cover, setCover] = useState(coverColors[0])
  const [template, setTemplate] = useState<Template>('dotted')
  const fileInput = useRef<HTMLInputElement>(null)
  const active = library?.notebooks.find(note => note.id === activeId)
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
        update(value => mergeBackup(value, imported))
        setNotice(`Imported ${imported.notebooks.length} ${imported.notebooks.length === 1 ? 'notebook' : 'notebooks'}. Existing notes were kept.`)
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

  const requestPersistence = async () => {
    await runTask('Checking storage protection…', async () => {
      if (!navigator.storage?.persist) throw new Error('This browser cannot request persistent storage. Keep regular exported backups.')
      const granted = await navigator.storage.persist()
      setNotice(granted ? 'Persistent storage granted. Keep exported backups too—clearing browser data still deletes notes.' : 'Storage protection was not granted. Your notes remain local; export regular backups.')
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
        <div className="local-card"><span className="local-icon"><ShieldCheck size={21} /></span><strong>Just you and your ideas.</strong><p>No accounts. No subscriptions.<br />Your notebooks stay on this device.</p><button onClick={() => setModal('help')}>How local storage works <span>↗</span></button></div>
        <button className="sidebar-help" onClick={() => setModal('help')}><CircleHelp size={17} /> Help & install</button>
        <div className="sidebar-signature"><Leaf size={15} /><span>Made for a more open world.</span></div>
      </div>
    </aside>

    <div className="main-column">
      {!active && <div className="status-strip">
        {saveIndicator}
        <div className="status-actions"><span className="connection-state">{!pwa.online ? <><WifiOff size={14} /> Offline</> : <><HardDrive size={14} /> Local-first</>}</span><InstallApp offlineReady={pwa.offlineReady} /></div>
      </div>}
      {(storageError || error || pwa.registrationError) && <div className="message error" role="alert"><span>{storageError || error || pwa.registrationError}</span>{storageError ? <><button onClick={retry}>Retry save</button><button disabled={!library} onClick={() => library && exportBackup(library)}>Export backup</button></> : error ? <button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button> : <button onClick={() => setModal('help')}>Offline help</button>}</div>}
      {notice && <div className="message notice" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {pwa.updateReady && <div className="message notice"><span>An update is ready. Finish writing and wait for “Saved on this device”, then close all OpenNotes tabs and reopen to update.</span></div>}
      {library ? active ? <NotebookEditor key={active.id} notebook={active} onUpdate={editNotebook} onBack={() => setActiveId(null)} onBackup={() => exportBackup({ format: 'opennotes', version: 1, notebooks: [active] }, active.title)} onPdf={() => void runTask('Preparing PDF…', () => exportPdf(active, setBusy))} onDelete={() => setModal('delete')} onError={showError} saveIndicator={saveIndicator} installAction={<InstallApp offlineReady={pwa.offlineReady} />} onHelp={() => setModal('help')} />
        : <NotebookLibrary notebooks={library.notebooks} onOpen={setActiveId} onCreate={() => { setName(''); setModal('create') }} onImport={() => fileInput.current?.click()} />
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
    {modal === 'delete' && active && <Dialog title="Delete this notebook?" onClose={() => setModal(null)}>
      <p>“{active.title}” and its {active.pages.length} pages will be removed from this device. This cannot be undone. Download a backup first if you may need it.</p>
      <div className="dialog-actions"><button className="secondary" onClick={() => setModal(null)}>Keep notebook</button><button className="danger-button" onClick={() => {
        update(value => ({ ...value, notebooks: value.notebooks.filter(note => note.id !== active.id) }))
        setActiveId(null)
        setModal(null)
      }}>Delete notebook</button></div>
    </Dialog>}
    {modal === 'help' && <Dialog title="Your notebook. Your device." onClose={() => setModal(null)}>
      <div className="help-content">
        <h3>Works without the internet</h3><p>{pwa.offlineReady ? 'The app is cached and ready for offline use.' : 'For offline use, open a production build from localhost or trusted HTTPS and allow its service worker to finish caching.'} Notes save locally in this browser. Nothing is uploaded.</p>
        <h3>Install on your iPad</h3><p>Open a trusted HTTPS copy in Safari, then use Share → Add to Home Screen. On Chrome desktop, use the browser’s Install option. A first load is required; double-clicking an HTML file does not install a PWA.</p>
        <h3>Local does not mean backed up</h3><p>Clearing site data, removing the app, changing its address, or storage eviction can lose notes. Use “Back up everything” regularly. There is no automatic cloud sync. HTTP localhost on Windows and HTTPS on iPad are separate libraries.</p>
        <button className="secondary" onClick={() => void requestPersistence()}><ShieldCheck size={17} /> Request storage protection</button>
        <h3>Writing & shortcuts</h3><p>Use P for pen, H for highlighter, E for eraser and V to pan. The circular eraser removes only the ink under its tip; adjust Eraser size to change its radius. Ctrl/Cmd+Z undoes; Shift adds redo. Palm protection starts automatically on iPad and when a pen is first detected. One touch does nothing, two fingers pan/zoom, and the Pan tool explicitly enables one-finger navigation. Touches are ignored during and briefly after pen input to reduce palm interference. Browser palm classification is limited; verify on your iPad.</p>
        <h3>Pages & files</h3><p>Notebook view starts page-first. Show pages opens thumbnails; Hide tools gives more writing space. Notebook options contains paper style, export, backup and help. Use Insert pages to add a blank page, PNG/JPEG/WebP images or PDF pages immediately after the current page. Existing ink stays unchanged. Images support up to 20 MB each; PDFs support up to 30 MB / 50 pages. A batch inserts up to 50 pages / 100 MB, within the 500-page notebook limit. Imported pages are rasterized; exports preserve appearance, not selectable PDF text. Editable backups use .opennotes format. Cloud sync, audio and handwriting recognition are not included.</p>
        <p className="quiet">OpenNotes is independent and is not affiliated with Goodnotes.</p>
      </div>
    </Dialog>}
  </div>
}
