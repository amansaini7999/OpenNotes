import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Eraser, FileDown, FilePlus2, FileUp, Hand, Highlighter, ImagePlus, ClipboardPaste, MousePointer2, LoaderCircle, Maximize, Minus, PanelLeft, PenLine, Plus, Redo2, Settings2, Undo2, X } from 'lucide-react'
import { colors, createPage, insertPagesAfter, dotRadius, isDotStroke, type Notebook, type Stroke, type Tool, type NotePage, type Template, type PlacedImage, type SourceAsset } from '../model'
import { InkCanvas } from './InkCanvas'
import { prefersPencilOnly } from '../input'
import { importPageFiles } from '../files'
import { Dialog } from './Dialog'
import { usesTabletLayout, type PageTurn } from '../navigation'
import { placeImage, moveImage } from '../images'
import { loadImage } from '../render'

interface Props {
  notebook: Notebook
  onUpdate: (update: (notebook: Notebook) => Notebook) => void
  onBack: () => void
  onPdf: () => void
  onError: (message: string) => void
  saveIndicator: ReactNode
}
type Snapshot = Pick<NotePage, 'strokes' | 'images'>
type History = { undo: Snapshot[]; redo: Snapshot[] }
const tools: { id: Tool; name: string; icon: typeof PenLine; shortcut: string }[] = [
  { id: 'pen', name: 'Pen', icon: PenLine, shortcut: 'P' },
  { id: 'highlighter', name: 'Highlighter', icon: Highlighter, shortcut: 'H' },
  { id: 'eraser', name: 'Eraser', icon: Eraser, shortcut: 'E' },
  { id: 'hand', name: 'Pan', icon: Hand, shortcut: 'V' },
  { id: 'image', name: 'Select images', icon: MousePointer2, shortcut: 'I' },
]

export function NotebookEditor({ notebook, onUpdate, onBack, onPdf, onError, saveIndicator }: Props) {
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
  const [panel, setPanel] = useState<'insert' | 'image' | 'tools' | null>(null)
  const [importing, setImporting] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const inlineInput = useRef<HTMLInputElement>(null)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [zoomCommand, setZoomCommand] = useState({ factor: 1, serial: 0 })
  const [historyVersion, setHistoryVersion] = useState(0)
  const histories = useRef(new Map<string, History>())
  const page = notebook.pages.find(value => value.id === pageId) ?? notebook.pages[0]
  const history = histories.current.get(page.id) ?? { undo: [], redo: [] }
  const pageIndex = notebook.pages.findIndex(value => value.id === page.id)

  const changePage = useCallback((id: string, update: (page: NotePage) => NotePage) => {
    onUpdate(note => ({ ...note, updatedAt: Date.now(), pages: note.pages.map(value => value.id === id ? update(value) : value) }))
  }, [onUpdate])

  const remember = () => {
    const previous = histories.current.get(page.id) ?? { undo: [], redo: [] }
    histories.current.set(page.id, { undo: [...previous.undo.slice(-49), { strokes: page.strokes, images: page.images }], redo: [] })
    setHistoryVersion(value => value + 1)
  }
  const commitStrokes = (strokes: Stroke[]) => { remember(); changePage(page.id, value => ({ ...value, strokes })) }
  const commitImages = (images: PlacedImage[], sources: SourceAsset[] = []) => {
    remember()
    onUpdate(note => ({ ...note, updatedAt: Date.now(), sources: [...note.sources, ...sources], pages: note.pages.map(value => value.id === page.id ? { ...value, images } : value) }))
  }

  const undo = () => {
    if (!history.undo.length) return
    const previous = history.undo.at(-1)!
    histories.current.set(page.id, { undo: history.undo.slice(0, -1), redo: [...history.redo, { strokes: page.strokes, images: page.images }] })
    changePage(page.id, value => ({ ...value, ...previous }))
    setHistoryVersion(value => value + 1)
  }
  const redo = () => {
    if (!history.redo.length) return
    const next = history.redo.at(-1)!
    histories.current.set(page.id, { undo: [...history.undo, { strokes: page.strokes, images: page.images }], redo: history.redo.slice(0, -1) })
    changePage(page.id, value => ({ ...value, ...next }))
    setHistoryVersion(value => value + 1)
  }
  const actions = useRef({ undo, redo })
  actions.current = { undo, redo }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable)) return
      if (document.querySelector('dialog[open]')) return
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
    setTool('pen')
    setSelectedImageId(null)
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
      setTool('pen')
      setSelectedImageId(null)
    } catch (cause: unknown) {
      onError(cause instanceof Error ? cause.message : 'Pages could not be imported. No pages were added.')
    } finally { setImporting('') }
  }
  async function insertInlineImages(files: File[]) {
    if (importing) { onError('Wait for the current import to finish before pasting another image.'); return }
    setPanel(null)
    setImporting('Adding image to this page…')
    try {
      if (files.some(file => /\.pdf$/i.test(file.name))) throw new Error('Choose images for inline insertion. PDFs can be inserted as pages.')
      const imported = await importPageFiles(files, Math.min(50, 100 - page.images.length), setImporting)
      const placed = await Promise.all(imported.sources.map(async (asset, index) => {
        const image = await loadImage(`data:${asset.mime};base64,${asset.data}`)
        const placed = placeImage(page, asset.id, image.naturalWidth, image.naturalHeight)
        return moveImage(placed, placed.x + index * 20, placed.y + index * 20, page)
      }))
      commitImages([...page.images, ...placed], imported.sources)
      setSelectedImageId(placed.at(-1)!.id)
      setTool('image')
    } catch (cause: unknown) { onError(cause instanceof Error ? cause.message : 'The image could not be inserted.') }
    finally { setImporting('') }
  }
  const inlineImporter = useRef(insertInlineImages)
  inlineImporter.current = insertInlineImages
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.closest('input,textarea,[contenteditable="true"]') || document.querySelector('dialog[open]'))) return
      const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/')).map(file => {
        if (/\.(png|jpe?g|webp)$/i.test(file.name)) return file
        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png'
        return new File([file], `pasted-image.${extension}`, { type: file.type })
      })
      if (!files.length) return
      event.preventDefault()
      void inlineImporter.current(files)
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [])
  const pasteImage = async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error('Clipboard image access is unavailable here.')
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of items) {
        const type = item.types.find(type => ['image/png', 'image/jpeg', 'image/webp'].includes(type))
        if (type) files.push(new File([await item.getType(type)], `pasted-image.${type === 'image/jpeg' ? 'jpg' : type.split('/')[1]}`, { type }))
      }
      if (!files.length) throw new Error('The clipboard does not contain a supported image. Copy a screenshot first.')
      await inlineImporter.current(files)
    } catch (cause: unknown) {
      setPanel(null)
      onError(`Paste failed: ${cause instanceof Error ? cause.message : 'Clipboard access was denied.'} Use Add content → Image → Choose image instead.`)
    }
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
      <button className="icon-button" aria-label="Add content" title="Add content" onClick={() => setPanel('insert')}><FilePlus2 size={20} /></button>
      <button className="icon-button" aria-label={toolsHidden ? 'Show tools' : 'Hide tools'} aria-pressed={toolsHidden} onClick={() => setToolsHidden(value => !value)}><PenLine size={19} /></button>
      <button className="icon-button" aria-label="Export PDF" onClick={onPdf}><FileDown size={20} /></button>
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
            <PagePreview page={value} sources={notebook.sources} /><span>{String(index + 1).padStart(2, '0')}</span>
          </button>)}
        </div>
        <button className="add-page" aria-label="Add page" onClick={addPage} disabled={notebook.pages.length >= 500}><Plus size={16} /> New page</button>
      </aside>}
      <div className="canvas-workspace">
        <InkCanvas key={page.id} page={page} sources={notebook.sources} tool={tool} color={color} width={width} eraserRadius={eraserRadius} penOnly={penOnly} fitMode={fitMode} fitToken={fitToken} zoomCommand={zoomCommand} onChange={commitStrokes} onZoom={setZoom} onError={onError} onPenDetected={() => setPenOnly(true)} pageSwipes={tabletLayout} pageTurn={tabletLayout ? pageTurn : null} onPageTurn={turnPage} selectedImageId={selectedImageId} onImageSelect={setSelectedImageId} onImagesChange={commitImages} />
        <div className="canvas-bottom">
          <div className="page-navigation">
            <button className="icon-button" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setPageId(notebook.pages[pageIndex - 1].id)}><ChevronLeft size={17} /></button>
            <button className="page-position" aria-label="Show page overview" onClick={() => setPagesOpen(value => !value)}>Page {pageIndex + 1} of {notebook.pages.length}</button>
            <button className="icon-button" aria-label="Next page" disabled={pageIndex === notebook.pages.length - 1} onClick={() => setPageId(notebook.pages[pageIndex + 1].id)}><ChevronRight size={17} /></button>
          </div>
          <label className="template-picker"><select aria-label="Paper template" disabled={Boolean(page.background)} value={page.template} onChange={e => changePage(page.id, value => ({ ...value, template: e.target.value as Template }))}><option value="dotted">Dotted paper</option><option value="ruled">Ruled paper</option><option value="plain">Plain paper</option></select></label>
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
    <input className="visually-hidden" ref={inlineInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" aria-label="Insert image on current page" onChange={event => {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (files.length) void insertInlineImages(files)
    }} />
    {importing && <div className="busy-overlay" role="status"><div><LoaderCircle className="spin" size={25} /><strong>{importing}</strong><span>Keep this window open.</span></div></div>}
    {panel === 'insert' && <Dialog title="Add to notebook" onClose={() => setPanel(null)}>
      <div className="document-actions add-content-actions">
        <button className="secondary" aria-label="Add page" onClick={addPage} disabled={notebook.pages.length >= 500}><Plus size={20} /><span><strong>New page</strong><small>Blank paper after page {pageIndex + 1}</small></span></button>
        <button className="secondary" aria-label="Image" onClick={() => setPanel('image')} disabled={page.images.length >= 100}><ImagePlus size={20} /><span><strong>Image</strong><small>Place on this page</small></span></button>
        <button className="secondary" aria-label="Import pages" onClick={() => importInput.current?.click()} disabled={notebook.pages.length >= 500}><FileUp size={20} /><span><strong>Import pages</strong><small>PDF or images after page {pageIndex + 1}</small></span></button>
      </div>
    </Dialog>}
    {panel === 'image' && <Dialog title="Insert image" onClose={() => setPanel(null)}>
      <p>Place a screenshot or photo on this page.</p>
      <div className="document-actions">
        <button className="secondary" onClick={() => inlineInput.current?.click()} disabled={page.images.length >= 100}><ImagePlus size={19} /> Choose image</button>
        <button className="secondary" onClick={() => void pasteImage()} disabled={page.images.length >= 100}><ClipboardPaste size={19} /> Paste from clipboard</button>
      </div>
      <button className="secondary" onClick={() => setPanel('insert')}><ArrowLeft size={16} /> Back</button>
    </Dialog>}
    {panel === 'tools' && <Dialog title="Tool settings" onClose={() => setPanel(null)}>
      {tool !== 'eraser' && <div className="tool-group color-group" aria-label="Ink colors">{colors.map(value => <button key={value} className={`color-swatch ${value === color ? 'active' : ''}`} style={{ '--swatch': value } as React.CSSProperties} aria-label={`Ink color ${value}`} aria-pressed={color === value} onClick={() => setColor(value)} />)}</div>}
      <label className="field">{tool === 'eraser' ? 'Eraser size' : 'Stroke width'}<input aria-label={tool === 'eraser' ? 'Eraser size' : 'Stroke width'} type="range" min={tool === 'eraser' ? 4 : 1} max={tool === 'eraser' ? 40 : 8} step={tool === 'eraser' ? 2 : 0.5} value={tool === 'eraser' ? eraserRadius : width} onChange={e => tool === 'eraser' ? setEraserRadius(Number(e.target.value)) : setWidth(Number(e.target.value))} /></label>
    </Dialog>}
  </main>
}

function PagePreview({ page, sources }: { page: NotePage; sources: SourceAsset[] }) {
  return <svg viewBox={`0 0 ${page.width} ${page.height}`} className={`page-preview ${page.template}`} aria-hidden="true">
    <rect width={page.width} height={page.height} fill="#fffefb" />
    {page.background && <image href={page.background} width={page.width} height={page.height} />}
    {!page.background && page.template === 'ruled' && Array.from({ length: 28 }, (_, i) => <line key={i} x1={30} x2={page.width - 30} y1={65 + i * 30} y2={65 + i * 30} stroke="#dce1dc" strokeWidth="2" />)}
    {page.images.map(image => {
      const asset = sources.find(value => value.id === image.assetId)
      return asset && <image key={image.id} href={`data:${asset.mime};base64,${asset.data}`} x={image.x} y={image.y} width={image.width} height={image.height} />
    })}
    {page.strokes.map(stroke => isDotStroke(stroke)
      ? <circle key={stroke.id} cx={stroke.points[0].x} cy={stroke.points[0].y} r={dotRadius(stroke)} fill={stroke.color} opacity={stroke.tool === 'highlighter' ? 0.3 : 1} />
      : <polyline key={stroke.id} points={stroke.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.tool === 'highlighter' ? stroke.width * 5 : stroke.width} opacity={stroke.tool === 'highlighter' ? 0.3 : 1} strokeLinecap="round" strokeLinejoin="round" />)}
  </svg>
}
