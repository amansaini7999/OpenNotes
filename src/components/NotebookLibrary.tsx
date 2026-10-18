import { BookOpen, MoreHorizontal, Trash2, FileUp, FolderOpen, Plus, Search, Sparkles, ArrowUpRight } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Notebook } from '../model'

interface Props {
  notebooks: Notebook[]
  onOpen: (id: string) => void
  onCreate: () => void
  onImport: () => void
  onDelete: (id: string) => void
}

export function NotebookLibrary({ notebooks, onOpen, onCreate, onImport, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const filtered = [...notebooks].filter(note => note.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return <main className="library">
    <header className="library-topline">
      <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
      <span className="quiet"><span className="small-dot" /> Private by default</span>
    </header>
    <section className="welcome">
      <div className="welcome-copy">
        <span className="welcome-kicker"><Sparkles size={15} /> A LITTLE ROOM TO THINK</span>
        <h1>Big ideas.<br /><em>Open possibilities.</em></h1>
        <p>A place for the notes, sketches, and little sparks<br className="desktop-break" /> that turn into something bigger. Make it yours.</p>
        <button className="primary" onClick={onCreate}><Plus size={18} /> Create a notebook <ArrowUpRight size={16} /></button>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="art-orbit" />
        <div className="art-paper"><span>Room for<br />a new idea.</span><svg viewBox="0 0 170 60"><path d="M5 40 Q 35 -10 56 30 T 95 22 T 157 28" /></svg><i>START ANYWHERE</i></div>
        <div className="art-book"><BookOpen size={46} strokeWidth={1} /><span>EVERYDAY<br />THOUGHTS</span><small>01 / OPENNOTES</small></div>
        <div className="art-pencil" />
        <span className="art-spark">+</span>
      </div>
    </section>

    <section className="notebooks-section" aria-labelledby="notebooks-heading">
      <div className="section-heading">
        <div><h2 id="notebooks-heading">Your notebooks <span className="count">{notebooks.length}</span></h2><p>A fresh page is always a good place to start.</p></div>
        <div className="library-actions">
          <label className="search"><Search size={16} /><input aria-label="Search notebooks" placeholder="Find a notebook..." value={search} onChange={e => setSearch(e.target.value)} /></label>
          <button className="secondary" onClick={onImport}><FileUp size={17} /><span>Import</span></button>
        </div>
      </div>
      <div className="notebook-grid">
        {filtered.map(note => <NotebookCard key={note.id} note={note} onOpen={onOpen} onDelete={onDelete} />)}
        {!search && <button className="new-notebook-card" onClick={onCreate}><span><Plus size={27} strokeWidth={1.5} /></span><strong>Something new starts here</strong><small>Create a notebook</small></button>}
        {search && !filtered.length && <div className="empty-search"><FolderOpen size={32} /><h3>No matching notebooks</h3><p>Try a different title.</p></div>}
      </div>
    </section>
    <footer className="library-footer"><span><BookOpen size={16} /> Your ideas belong to you.</span><span>Free. Local-first. Open source.</span></footer>
  </main>
}

function NotebookCard({ note, onOpen, onDelete }: { note: Notebook; onOpen: Props['onOpen']; onDelete: Props['onDelete'] }) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  return <article className="notebook-card">
    <button className="notebook-open" onClick={() => onOpen(note.id)} aria-label={`Open ${note.title}`}>
      <div className="book-cover" style={{ '--cover': note.color } as React.CSSProperties}>
        <span className="book-spine" /><span className="book-label">OPENNOTES</span>
        <h3>{note.title}</h3><BookOpen size={26} strokeWidth={1.2} /><span className="cover-rule" />
      </div>
    </button>
    <div className={`notebook-title-row ${actionsOpen ? 'actions-open' : ''}`} aria-label={`Notebook name ${note.title}`}
      onClickCapture={event => {
        if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
      }}
      onPointerDown={event => {
        suppressClick.current = false
        if (event.button === 0) start.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerCancel={() => { start.current = null }}
      onPointerUp={event => {
        const first = start.current
        start.current = null
        if (first && Math.abs(event.clientX - first.x) > 50 && Math.abs(event.clientY - first.y) < 40) {
          suppressClick.current = true
          setActionsOpen(event.clientX < first.x)
        }
      }}>
      <div className="book-info"><strong>{note.title}</strong><button className="icon-button" aria-label={`Notebook actions for ${note.title}`} aria-expanded={actionsOpen} onClick={() => setActionsOpen(value => !value)}><MoreHorizontal size={17} /></button></div>
      {actionsOpen && <button className="icon-button danger notebook-delete" aria-label={`Delete ${note.title}`} onClick={() => onDelete(note.id)}><Trash2 size={17} /></button>}
    </div>
    <p>{note.pages.length} {note.pages.length === 1 ? 'page' : 'pages'}<span>·</span>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
  </article>
}
