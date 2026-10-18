import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, Download, Eraser, FileDown, Hand, Highlighter, Maximize, Minus, PenLine, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { colors, createPage, type Notebook, type Stroke, type Tool, type NotePage, type Template } from '../model'
import { InkCanvas } from './InkCanvas'

interface Props {
  notebook: Notebook
  onUpdate: (update: (notebook: Notebook) => Notebook) => void
  onBack: () => void
  onBackup: () => void
  onPdf: () => void
  onDelete: () => void
  onError: (message: string) => void
}
type History = { undo: Stroke[][]; redo: Stroke[][] }
const tools: { id: Tool; name: string; icon: typeof PenLine; shortcut: string }[] = [
  { id: 'pen', name: 'Pen', icon: PenLine, shortcut: 'P' },
  { id: 'highlighter', name: 'Highlighter', icon: Highlighter, shortcut: 'H' },
  { id: 'eraser', name: 'Stroke eraser', icon: Eraser, shortcut: 'E' },
  { id: 'hand', name: 'Pan', icon: Hand, shortcut: 'V' },
]

export function NotebookEditor({ notebook, onUpdate, onBack, onBackup, onPdf, onDelete, onError }: Props) {
  const [pageId, setPageId] = useState(notebook.pages[0].id)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(colors[0])
  const [width, setWidth] = useState(3)
  const [penOnly, setPenOnly] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [fitToken, setFitToken] = useState(0)
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
    onUpdate(note => ({ ...note, updatedAt: Date.now(), pages: [...note.pages, next] }))
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
        <span>{notebook.pages.length} {notebook.pages.length === 1 ? 'page' : 'pages'} · Personal notebook</span>
      </div>
      <button className="secondary export-button" onClick={onPdf}><FileDown size={17} /><span>Export PDF</span></button>
      <button className="icon-button" aria-label="Download notebook backup" title="Download editable notebook backup" onClick={onBackup}><Download size={19} /></button>
      <button className="icon-button danger" aria-label="Delete notebook" onClick={onDelete}><Trash2 size={18} /></button>
    </header>
    <div className="ink-toolbar" aria-label="Drawing tools">
      <div className="tool-group">
        {tools.map(item => <button key={item.id} className={`tool-button ${tool === item.id ? 'selected' : ''}`} aria-label={item.name} aria-pressed={tool === item.id} title={`${item.name} (${item.shortcut})`} onClick={() => setTool(item.id)}><item.icon size={21} /></button>)}
      </div>
      <span className="toolbar-divider" />
      <div className="tool-group color-group" aria-label="Ink colors">{colors.map(value => <button key={value} className={`color-swatch ${value === color ? 'active' : ''}`} style={{ '--swatch': value } as React.CSSProperties} aria-label={`Ink color ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} />)}</div>
      <span className="toolbar-divider" />
      <label className="width-control"><span>Size</span><input aria-label="Stroke width" type="range" min="1" max="8" step="0.5" value={width} onChange={e => setWidth(Number(e.target.value))} /><span className="width-dot" style={{ width: width + 3, height: width + 3 }} /></label>
      <span className="toolbar-divider" />
      <div className="tool-group">
        <button className="tool-button" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={!history.undo.length} onClick={undo}><Undo2 size={20} /></button>
        <button className="tool-button" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!history.redo.length} onClick={redo}><Redo2 size={20} /></button>
      </div>
      <label className="pencil-toggle"><input type="checkbox" checked={penOnly} onChange={e => setPenOnly(e.target.checked)} /><span>Pencil only</span></label>
    </div>
    <div className="editor-body">
      <aside className="pages-panel" aria-label="Notebook pages">
        <div className="pages-heading"><span>PAGES</span><button className="icon-button" aria-label="Add page" disabled={notebook.pages.length >= 500} onClick={addPage}><Plus size={17} /></button></div>
        <div className="page-list">
          {notebook.pages.map((value, index) => <button className={`page-tile ${page.id === value.id ? 'active' : ''}`} key={value.id} onClick={() => setPageId(value.id)} aria-label={`Page ${index + 1}`} aria-current={page.id === value.id ? 'page' : undefined}>
            <PagePreview page={value} /><span>{String(index + 1).padStart(2, '0')}</span>
          </button>)}
        </div>
        <button className="add-page" onClick={addPage} disabled={notebook.pages.length >= 500}><Plus size={16} /> New page</button>
      </aside>
      <div className="canvas-workspace">
        <InkCanvas key={page.id} page={page} tool={tool} color={color} width={width} penOnly={penOnly} fitToken={fitToken} zoomCommand={zoomCommand} onChange={commitStrokes} onZoom={setZoom} onError={onError} />
        <div className="canvas-bottom">
          <label className="template-picker"><select aria-label="Paper template" disabled={Boolean(page.background)} value={page.template} onChange={e => changePage(page.id, value => ({ ...value, template: e.target.value as Template }))}><option value="dotted">Dotted paper</option><option value="ruled">Ruled paper</option><option value="plain">Plain paper</option></select><ChevronDown size={14} /></label>
          <span className="page-indicator">Page {pageIndex + 1} of {notebook.pages.length}</span>
          <div className="zoom-controls">
            <button className="icon-button" aria-label="Zoom out" onClick={() => setZoomCommand(value => ({ factor: 0.8, serial: value.serial + 1 }))}><Minus size={15} /></button>
            <span aria-live="polite">{zoom}%</span>
            <button className="icon-button" aria-label="Zoom in" onClick={() => setZoomCommand(value => ({ factor: 1.25, serial: value.serial + 1 }))}><Plus size={15} /></button>
            <button className="icon-button" aria-label="Fit page" onClick={() => setFitToken(value => value + 1)}><Maximize size={16} /></button>
          </div>
        </div>
      </div>
    </div>
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
