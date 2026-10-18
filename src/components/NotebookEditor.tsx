import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Eraser, FileDown, FilePlus2, FileUp, Hand, Highlighter, ImagePlus, LoaderCircle, Maximize, Minus, MoreHorizontal, PanelLeft, PenLine, Plus, Redo2, Settings2, Trash2, Undo2, X } from 'lucide-react'
import { colors, createPage, insertPagesAfter, type Notebook, type Stroke, type Tool, type NotePage, type Template } from '../model'
import { InkCanvas } from './InkCanvas'
import { prefersPencilOnly } from '../input'
import { importPageFiles } from '../files'
import { Dialog } from './Dialog'
import { usesTabletLayout, type PageTurn } from '../navigation'

interface Props {
  notebook: Notebook
  onUpdate: (update: (notebook: Notebook) => Notebook) => void
  onBack: () => void
  onBackup: () => void
  onPdf: () => void
  onDelete: () => void
  onError: (message: string) => void
  saveIndicator: ReactNode
  onHelp: () => void
}
type History = { undo: Stroke[][]; redo: Stroke[][] }
const tools: { id: Tool; name: string; icon: typeof PenLine; shortcut: string }[] = [
  { id: 'pen', name: 'Pen', icon: PenLine, shortcut: 'P' },
  { id: 'highlighter', name: 'Highlighter', icon: Highlighter, shortcut: 'H' },
  { id: 'eraser', name: 'Eraser', icon: Eraser, shortcut: 'E' },
  { id: 'hand', name: 'Pan', icon: Hand, shortcut: 'V' },
]

export function NotebookEditor({ notebook, onUpdate, onBack, onBackup, onPdf, onDelete, onError, saveIndicator, onHelp }: Props) {
  const [tabletLayout] = useState(() => usesTabletLayout(navigator.userAgent, navigator.platform, navigator.maxTouchPoints, matchMedia('(pointer: coarse)').matches))
  const [pageId, setPageId] = useState(notebook.pages[0].id)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(colors[0])
  const [width, setWidth] = useState(3)
  const [eraserRadius, setEraserRadius] = useState(18)
  const [penOnly, setPenOnly] = useState(() => prefersPencilOnly(navigator.userAgent, navigator.platform, navigator.maxTouchPoints))
  const [zoom, setZoom] = useState(100)
  const [fitToken, setFitToken] = useState(0)
  const [fitMode, setFitMode] = useState<'width' | 'page'>(tabletLayout ? 'width' : 'page')
  const [pagesOpen, setPagesOpen] = useState(!tabletLayout)
  const [pageTurn, setPageTurn] = useState<PageTurn | null>(null)
  const [toolsHidden, setToolsHidden] = useState(false)
  const [panel, setPanel] = useState<'insert' | 'tools' | 'document' | null>(null)
  const [importing, setImporting] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const [zoomCommand, setZoomCommand] = useState({ factor: 1, serial: 0 })
  const [historyVersion, setHistoryVersion] = useState(0)
  const histories = useRef(new Map<string, History>())
  const page = notebook.pages.find(value => value.id === pageId) ?? notebook.pages[0]
  const history = histories.current.get(page.id) ?? { undo: [], redo: [] }
  const pageIndex = notebook.pages.findIndex(value => value.id === page.id)

  const changePage = useCallback((id: string, update: (page: NotePage) => NotePage) => {
    onUpdate(note => ({ ...note, updatedAt: Date.now(), pages: note.pages.map(value => value.id === id ? update(value) : value) }))
  }, [onUpdate])

  const commitStrokes = (strokes: Stroke[]) => {
    const previous = histories.current.get(page.id) ?? { undo: [], redo: [] }
    histories.current.set(page.id, { undo: [...previous.undo.slice(-49), page.strokes], redo: [] })
    changePage(page.id, value => ({ ...value, strokes }))
    setHistoryVersion(value => value + 1)
  }

  const undo = () => {
    if (!history.undo.length) return
    const previous = history.undo.at(-1)!
    histories.current.set(page.id, { undo: history.undo.slice(0, -1), redo: [...history.redo, page.strokes] })
    changePage(page.id, value => ({ ...value, strokes: previous }))
    setHistoryVersion(value => value + 1)
  }
  const redo = () => {
    if (!history.redo.length) return
    const next = history.redo.at(-1)!
    histories.current.set(page.id, { undo: [...history.undo, page.strokes], redo: history.redo.slice(0, -1) })
    changePage(page.id, value => ({ ...value, strokes: next }))
    setHistoryVersion(value => value + 1)
  }
  const actions = useRef({ undo, redo })
  actions.current = { undo, redo }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) actions.current.redo()
        else actions.current.undo()
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const match = tools.find(value => value.shortcut.toLowerCase() === event.key.toLowerCase())
        if (match) setTool(match.id)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])

  const addPage = () => {
    const next = createPage(page.template)
    onUpdate(note => insertPagesAfter(note, page.id, [next]))
    setPageId(next.id)
    setPanel(null)
  }
  const insertFiles = async (files: File[]) => {
    const afterId = page.id
    setPanel(null)
    setImporting('Preparing pages…')
    try {
      const imported = await importPageFiles(files, 500 - notebook.pages.length, setImporting)
      onUpdate(note => insertPagesAfter(note, afterId, imported.pages, imported.sources))
      setPageId(imported.pages[0].id)
    } catch (cause: unknown) {
      onError(cause instanceof Error ? cause.message : 'Pages could not be imported. No pages were added.')
    } finally { setImporting('') }
  }
  const fit = (mode: 'width' | 'page') => {
    setFitMode(mode)
    setFitToken(value => value + 1)
  }
  const turnPage = (direction: PageTurn) => {
    const next = notebook.pages[pageIndex + (direction === 'next' ? 1 : -1)]
    if (!next) return
    setPageTurn(direction)
    setZoomCommand({ factor: 1, serial: 0 })
    setPageId(next.id)
  }

  return <main className="editor" data-history-version={historyVersion}>
    <header className="editor-header">
      <button className="icon-button" aria-label="Back to notebooks" onClick={onBack}><ArrowLeft size={20} /></button>
      <div className="editor-title">
        <input aria-label="Notebook title" maxLength={100} value={notebook.title} onChange={e => {
          const title = e.target.value
          if (title.trim()) onUpdate(note => ({ ...note, title, updatedAt: Date.now() }))
        }} />
      </div>
      {saveIndicator}
      <button className="icon-button" aria-label={pagesOpen ? 'Hide pages' : 'Show pages'} aria-expanded={pagesOpen} aria-controls="notebook-pages" onClick={() => setPagesOpen(value => !value)}><PanelLeft size={20} /></button>
      <button className="icon-button" aria-label="Insert pages" onClick={() => setPanel('insert')}><FilePlus2 size={20} /></button>
      <button className="icon-button" aria-label={toolsHidden ? 'Show tools' : 'Hide tools'} aria-pressed={toolsHidden} onClick={() => setToolsHidden(value => !value)}><PenLine size={19} /></button>
      <button className="icon-button" aria-label="Notebook options" onClick={() => setPanel('document')}><MoreHorizontal size={22} /></button>
    </header>
    {!toolsHidden && <div className="ink-toolbar" role="toolbar" aria-label="Drawing tools">
      <div className="tool-group">
        {tools.map(item => <button key={item.id} className={`tool-button ${tool === item.id ? 'selected' : ''}`} aria-label={item.name} aria-pressed={tool === item.id} title={`${item.name} (${item.shortcut})`} onClick={() => setTool(item.id)}><item.icon size={21} /></button>)}
      </div>
      <button className="tool-button settings-button" aria-label="Tool settings" onClick={() => setPanel('tools')}><span className="current-ink" style={{ background: color }} /><Settings2 size={17} /></button>
      <span className="toolbar-divider" />
      <div className="tool-group">
        <button className="tool-button" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={!history.undo.length} onClick={undo}><Undo2 size={20} /></button>
        <button className="tool-button" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!history.redo.length} onClick={redo}><Redo2 size={20} /></button>
      </div>
    </div>}
    <div className="editor-body">
      {pagesOpen && <aside className="pages-panel" id="notebook-pages" aria-label="Notebook pages">
        <div className="pages-heading"><span>PAGES</span><button className="icon-button" aria-label="Close pages" onClick={() => setPagesOpen(false)}><X size={17} /></button></div>
        <div className="page-list">
          {notebook.pages.map((value, index) => <button className={`page-tile ${page.id === value.id ? 'active' : ''}`} key={value.id} onClick={() => setPageId(value.id)} aria-label={`Page ${index + 1}`} aria-current={page.id === value.id ? 'page' : undefined}>
            <PagePreview page={value} /><span>{String(index + 1).padStart(2, '0')}</span>
          </button>)}
        </div>
        <button className="add-page" onClick={() => setPanel('insert')} disabled={notebook.pages.length >= 500}><Plus size={16} /> Insert pages</button>
      </aside>}
      <div className="canvas-workspace">
        <InkCanvas key={page.id} page={page} tool={tool} color={color} width={width} eraserRadius={eraserRadius} penOnly={penOnly} fitMode={fitMode} fitToken={fitToken} zoomCommand={zoomCommand} onChange={commitStrokes} onZoom={setZoom} onError={onError} onPenDetected={() => setPenOnly(true)} pageSwipes={tabletLayout} pageTurn={tabletLayout ? pageTurn : null} onPageTurn={turnPage} />
        <div className="canvas-bottom">
          <div className="page-navigation">
            <button className="icon-button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setPageId(notebook.pages[pageIndex - 1].id)}><ChevronLeft size={17} /></button>
            <button className="page-position" aria-label="Show page overview" onClick={() => setPagesOpen(value => !value)}>Page {pageIndex + 1} of {notebook.pages.length}</button>
            <button className="icon-button" aria-label="Next page" disabled={pageIndex === notebook.pages.length - 1} onClick={() => setPageId(notebook.pages[pageIndex + 1].id)}><ChevronRight size={17} /></button>
          </div>
          <div className="zoom-controls">
            <button className="icon-button" aria-label="Zoom out" onClick={() => setZoomCommand(value => ({ factor: 0.8, serial: value.serial + 1 }))}><Minus size={15} /></button>
            <span aria-live="polite">{zoom}%</span>
            <button className="icon-button" aria-label="Zoom in" onClick={() => setZoomCommand(value => ({ factor: 1.25, serial: value.serial + 1 }))}><Plus size={15} /></button>
            <button className="icon-button" aria-label="Fit page" onClick={() => fit('page')}><Maximize size={16} /></button>
            <button className="fit-width" aria-label="Fit width" onClick={() => fit('width')}>Width</button>
          </div>
        </div>
      </div>
    </div>
    <input className="visually-hidden" ref={importInput} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" aria-label="Insert PDF or images as pages" onChange={event => {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (files.length) void insertFiles(files)
    }} />
    {importing && <div className="busy-overlay" role="status"><div><LoaderCircle className="spin" size={25} /><strong>{importing}</strong><span>Adding pages after page {pageIndex + 1}. Keep this window open.</span></div></div>}
    {panel === 'insert' && <Dialog title="Insert pages" onClose={() => setPanel(null)}>
      <p>Add pages immediately after page {pageIndex + 1}. Existing pages and handwriting stay unchanged.</p>
      <div className="document-actions">
        <button className="secondary" aria-label="Add page" onClick={addPage} disabled={notebook.pages.length >= 500}><Plus size={19} /> Blank page</button>
        <button className="secondary" onClick={() => importInput.current?.click()} disabled={notebook.pages.length >= 500}><ImagePlus size={19} /> Images as pages</button>
        <button className="secondary" onClick={() => importInput.current?.click()} disabled={notebook.pages.length >= 500}><FileUp size={19} /> PDF pages</button>
      </div>
      <p>Choose PNG, JPEG, WebP or PDF files. Up to 50 inserted pages per operation and 500 pages per notebook. Images become full-page backgrounds you can write on.</p>
    </Dialog>}
    {panel === 'tools' && <Dialog title="Tool settings" onClose={() => setPanel(null)}>
      {tool !== 'eraser' && <div className="tool-group color-group" aria-label="Ink colors">{colors.map(value => <button key={value} className={`color-swatch ${value === color ? 'active' : ''}`} style={{ '--swatch': value } as React.CSSProperties} aria-label={`Ink color ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} />)}</div>}
      <label className="field">{tool === 'eraser' ? 'Eraser size' : 'Stroke width'}<input aria-label={tool === 'eraser' ? 'Eraser size' : 'Stroke width'} type="range" min={tool === 'eraser' ? 4 : 1} max={tool === 'eraser' ? 40 : 8} step={tool === 'eraser' ? 2 : 0.5} value={tool === 'eraser' ? eraserRadius : width} onChange={e => tool === 'eraser' ? setEraserRadius(Number(e.target.value)) : setWidth(Number(e.target.value))} /></label>
    </Dialog>}
    {panel === 'document' && <Dialog title="Notebook options" onClose={() => setPanel(null)}>
      <label className="field">Paper template<select aria-label="Paper template" disabled={Boolean(page.background)} value={page.template} onChange={e => changePage(page.id, value => ({ ...value, template: e.target.value as Template }))}><option value="dotted">Dotted paper</option><option value="ruled">Ruled paper</option><option value="plain">Plain paper</option></select></label>
      {page.background && <p>This page uses an imported image or PDF background.</p>}
      <div className="document-actions">
        <button className="secondary" onClick={() => { setPanel(null); onPdf() }}><FileDown size={18} /> Export PDF</button>
        <button className="secondary" aria-label="Download notebook backup" onClick={() => { setPanel(null); onBackup() }}><Download size={18} /> Editable backup</button>
        <button className="secondary" onClick={() => { setPanel(null); onHelp() }}>Help</button>
        <button className="secondary danger" aria-label="Delete notebook" onClick={() => { setPanel(null); onDelete() }}><Trash2 size={18} /> Delete notebook</button>
      </div>
    </Dialog>}
  </main>
}

function PagePreview({ page }: { page: NotePage }) {
  return <svg viewBox={`0 0 ${page.width} ${page.height}`} className={`page-preview ${page.template}`} aria-hidden="true">
    <rect width={page.width} height={page.height} fill="#fffefb" />
    {page.background && <image href={page.background} width={page.width} height={page.height} />}
    {!page.background && page.template === 'ruled' && Array.from({ length: 28 }, (_, i) => <line key={i} x1={30} x2={page.width - 30} y1={65 + i * 30} y2={65 + i * 30} stroke="#dce1dc" strokeWidth="2" />)}
    {page.strokes.map(stroke => <polyline key={stroke.id} points={stroke.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.tool === 'highlighter' ? stroke.width * 5 : stroke.width} opacity={stroke.tool === 'highlighter' ? 0.3 : 1} strokeLinecap="round" strokeLinejoin="round" />)}
  </svg>
}
