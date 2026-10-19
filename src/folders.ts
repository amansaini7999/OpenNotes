import type { Folder, Library } from './model'

export function folderPath(folders: Folder[], id?: string): Folder[] {
  const path: Folder[] = []
  const seen = new Set<string>()
  while (id) {
    const folder = folders.find(folder => folder.id === id)
    if (!folder || seen.has(id)) throw new Error('This folder path is invalid. Reload or recover a backup.')
    path.unshift(folder)
    seen.add(id)
    id = folder.parentId
  }
  return path
}

function folderName(folders: Folder[], name: string, parentId?: string, except?: string) {
  const clean = name.trim()
  if (!clean || clean.length > 100) throw new Error('Use a folder name between 1 and 100 characters.')
  if (folders.some(folder => folder.id !== except && folder.parentId === parentId && folder.name.normalize('NFKC').toLowerCase() === clean.normalize('NFKC').toLowerCase())) {
    throw new Error('A folder with this name already exists here. Rename or move it first.')
  }
  return clean
}

export function addFolder(library: Library, name: string, parentId?: string): Library {
  folderPath(library.folders, parentId)
  if (library.folders.length >= 1000) throw new Error('A workspace supports up to 1,000 folders.')
  const folder: Folder = { id: crypto.randomUUID(), name: folderName(library.folders, name, parentId), parentId }
  return { ...library, folders: [...library.folders, folder] }
}

export function changeFolder(library: Library, id: string, name: string, parentId?: string): Library {
  if (!library.folders.some(folder => folder.id === id)) throw new Error('This folder no longer exists.')
  if (folderPath(library.folders, parentId).some(folder => folder.id === id)) throw new Error('A folder cannot be moved into itself or its subfolders.')
  const clean = folderName(library.folders, name, parentId, id)
  return { ...library, folders: library.folders.map(folder => folder.id === id ? { ...folder, name: clean, parentId } : folder) }
}

export function moveNotebook(library: Library, id: string, folderId?: string): Library {
  folderPath(library.folders, folderId)
  if (!library.notebooks.some(note => note.id === id)) throw new Error('This notebook no longer exists.')
  return { ...library, notebooks: library.notebooks.map(note => note.id === id ? { ...note, folderId } : note) }
}

export function deleteFolder(library: Library, id: string): Library {
  const removed = library.folders.find(folder => folder.id === id)
  if (!removed) throw new Error('This folder no longer exists.')
  const children = library.folders.filter(folder => folder.parentId === id)
  const folders = library.folders.filter(folder => folder.id !== id).map(folder => folder.parentId === id ? { ...folder, parentId: removed.parentId } : folder)
  for (const child of children) {
    folderName(folders, child.name, removed.parentId, child.id)
  }
  return {
    ...library, folders,
    notebooks: library.notebooks.map(note => note.folderId === id ? { ...note, folderId: removed.parentId } : note),
  }
}

// Keep local organization; restore missing folders by stable identity or parent/name.
export function mergeFolderStructure(local: Folder[], incoming: Folder[]) {
  const folders = [...local]
  const ids = new Map<string, string>()
  const pending = new Set(incoming.map(folder => folder.id))
  while (pending.size) {
    let progressed = false
    for (const folder of incoming) {
      if (!pending.has(folder.id) || (folder.parentId && !ids.has(folder.parentId))) continue
      const parentId = folder.parentId ? ids.get(folder.parentId)! : undefined
      const match = folders.find(value => value.id === folder.id) ?? folders.find(value =>
        value.parentId === parentId && value.name.normalize('NFKC').toLowerCase() === folder.name.normalize('NFKC').toLowerCase())
      if (!match) folders.push({ ...folder, parentId })
      ids.set(folder.id, match?.id ?? folder.id)
      pending.delete(folder.id)
      progressed = true
    }
    if (!progressed) throw new Error('Backup folders contain a missing parent or a cycle.')
  }
  if (folders.length > 1000) throw new Error('Restoring would exceed the workspace limit of 1,000 folders.')
  return { folders, ids }
}
