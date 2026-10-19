import { FolderOpen, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import type { Library } from '../model'
import { addFolder, changeFolder, deleteFolder, folderPath, moveNotebook } from '../folders'
import { Dialog } from './Dialog'
import { NotebookLibrary } from './NotebookLibrary'

interface Props {
  library: Library
  folderId?: string
  onFolder: (id?: string) => void
  onUpdate: (change: (library: Library) => Library) => Promise<boolean>
  onError: (message: string) => void
  onOpen: (id: string) => void
  onCreate: () => void
  onImport: () => void
  onDelete: (id: string) => void
}
type Action = { kind: 'create' } | { kind: 'edit' | 'delete' | 'move'; id: string }

export function FolderLibrary({ library, folderId, onFolder, onUpdate, onError, ...actions }: Props) {
  const [action, setAction] = useState<Action | null>(null)
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')
  const path = folderPath(library.folders, folderId)
  const current = path.at(-1)
  const folder = action && action.kind !== 'create' ? library.folders.find(folder => folder.id === action.id) : undefined
  const note = action?.kind === 'move' ? library.notebooks.find(note => note.id === action.id) : undefined
  const begin = (next: Action) => {
    setFailure('')
    setName(next.kind === 'edit' ? library.folders.find(folder => folder.id === next.id)!.name : '')
    setParent(next.kind === 'edit' ? library.folders.find(folder => folder.id === next.id)!.parentId ?? '' :
      next.kind === 'move' ? library.notebooks.find(note => note.id === next.id)!.folderId ?? '' : folderId ?? '')
    setAction(next)
  }
  const save = async () => {
    if (!action) return
    setSaving(true)
    setFailure('')
    try {
      const saved = await onUpdate(value => action.kind === 'create' ? addFolder(value, name, parent || undefined) :
        action.kind === 'edit' ? changeFolder(value, action.id, name, parent || undefined) :
        action.kind === 'move' ? moveNotebook(value, action.id, parent || undefined) : deleteFolder(value, action.id))
      if (!saved) throw new Error('Folder changes are not saved on this device. Export a backup and retry saving.')
      if (action.kind === 'delete' && action.id === folderId) onFolder(folder?.parentId)
      setAction(null)
      onError('')
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : 'The folder change failed. Please retry.'
      setFailure(message)
      onError(message)
    } finally { setSaving(false) }
  }
  const choices = library.folders
    .filter(value => action?.kind !== 'edit' || !folderPath(library.folders, value.id).some(ancestor => ancestor.id === action.id))
    .map(value => ({ id: value.id, label: folderPath(library.folders, value.id).map(part => part.name).join(' / ') }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const controls = <section className="folder-section" aria-label="Folders">
    <div className="folder-heading">
      <nav className="folder-breadcrumbs" aria-label="Folder path">
        <button onClick={() => onFolder()} aria-current={!current ? 'page' : undefined}>All notebooks</button>
        {path.map(part => <span key={part.id}><span aria-hidden="true"> / </span><button onClick={() => onFolder(part.id)} aria-current={part.id === folderId ? 'page' : undefined}>{part.name}</button></span>)}
      </nav>
      <button className="secondary" onClick={() => begin({ kind: 'create' })}><Plus size={16} /> New folder</button>
    </div>
    {current && <button className="folder-current-actions secondary" aria-label={`Manage folder ${current.name}`} onClick={() => begin({ kind: 'edit', id: current.id })}><MoreHorizontal size={16} /> Folder settings</button>}
    <div className="folder-grid">
      {library.folders.filter(folder => folder.parentId === folderId).sort((a, b) => a.name.localeCompare(b.name)).map(folder => <div className="folder-card" key={folder.id}>
        <button className="folder-open" aria-label={`Open folder ${folder.name}`} onClick={() => onFolder(folder.id)}><FolderOpen size={24} /><strong>{folder.name}</strong></button>
        <button className="icon-button" aria-label={`Manage folder ${folder.name}`} onClick={() => begin({ kind: 'edit', id: folder.id })}><MoreHorizontal size={18} /></button>
      </div>)}
    </div>
  </section>
  return <>
    <NotebookLibrary key={folderId ?? 'all'} {...actions} onMove={id => begin({ kind: 'move', id })} notebooks={folderId ? library.notebooks.filter(note => note.folderId === folderId) : library.notebooks} folders={controls} heading={current?.name ?? 'Your notebooks'} nested={Boolean(current)} />
    {action && <Dialog title={action.kind === 'create' ? 'New folder' : action.kind === 'edit' ? 'Folder settings' : action.kind === 'move' ? 'Move notebook' : 'Delete folder?'} onClose={() => { if (!saving) setAction(null) }}>
      {failure && <p className="message error" role="alert">{failure}</p>}
      {action.kind === 'delete' ? <p>Delete &ldquo;{folder?.name}&rdquo;? Its notebooks and immediate subfolders will move up one level. No notebook or page will be deleted. If subfolder names conflict at the destination, rename or move them first.</p> :
        <form id="folder-form" onSubmit={event => { event.preventDefault(); void save() }}>
          {action.kind === 'move' ? <p>Move &ldquo;{note?.title}&rdquo; without copying it or changing its pages.</p> :
            <label className="field">Folder name<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>}
          <label className="field">{action.kind === 'move' ? 'Destination folder' : 'Parent folder'}<select aria-label={action.kind === 'move' ? 'Destination folder' : 'Parent folder'} value={parent} onChange={event => setParent(event.target.value)}>
            <option value="">{action.kind === 'move' ? 'Unfiled (top level)' : 'Top level'}</option>
            {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </select></label>
        </form>}
      <div className="dialog-actions">
        {action.kind === 'edit' && <button className="danger-button" disabled={saving} onClick={() => setAction({ kind: 'delete', id: action.id })}>Delete folder</button>}
        <button className="secondary" disabled={saving} onClick={() => setAction(null)}>Cancel</button>
        {action.kind === 'delete' ? <button className="danger-button" disabled={saving} onClick={() => void save()}>Delete folder</button> :
          <button className="primary" type="submit" form="folder-form" disabled={saving || (action.kind !== 'move' && !name.trim())}>{action.kind === 'create' ? 'Create folder' : action.kind === 'move' ? 'Move notebook' : 'Save folder'}</button>}
      </div>
    </Dialog>}
  </>
}
