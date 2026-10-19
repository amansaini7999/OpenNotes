import { describe, expect, it } from 'vitest'
import { backupSchema, createNotebook, emptyLibrary, mergeBackup, readBackup } from './model'
import { addFolder, changeFolder, deleteFolder, folderPath, mergeFolderStructure, moveNotebook } from './folders'
import { notebookHash, planBackupRestore } from './backup'

function fixture() {
  let library = addFolder(emptyLibrary(), 'MBBS')
  const root = library.folders[0].id
  library = addFolder(library, 'Anatomy', root)
  const child = library.folders[1].id
  library = { ...library, notebooks: [createNotebook('Revision')] }
  library = moveNotebook(library, library.notebooks[0].id, child)
  return { library, root, child }
}

describe('nested folders', () => {
  it('creates nested folders and moves a notebook without changing identity or content', async () => {
    const { library, root, child } = fixture()
    const before = library.notebooks[0]
    const moved = moveNotebook(library, before.id, root)
    expect(moved.notebooks[0]).toEqual({ ...before, folderId: root })
    expect(await notebookHash(moved.notebooks[0])).toBe(await notebookHash(before))
    expect(folderPath(library.folders, child).map(folder => folder.name)).toEqual(['MBBS', 'Anatomy'])
    expect(changeFolder(library, child, 'Neuroanatomy').folders[1]).toMatchObject({ name: 'Neuroanatomy', parentId: undefined })
    expect(library.folders[1].name).toBe('Anatomy')
    expect(backupSchema.safeParse(moved).success).toBe(true)
  })
  it('rejects cycles, missing destinations and case-insensitive sibling duplicates', () => {
    const { library, root, child } = fixture()
    expect(() => changeFolder(library, root, 'MBBS', child)).toThrow('subfolders')
    expect(() => addFolder(library, ' anatomy ', root)).toThrow('already exists')
    expect(() => addFolder(library, '', root)).toThrow('between 1 and 100')
    expect(() => moveNotebook(library, library.notebooks[0].id, crypto.randomUUID())).toThrow('invalid')
    expect(() => moveNotebook(library, crypto.randomUUID(), root)).toThrow('no longer exists')
    expect(() => mergeFolderStructure([], [{ id: root, name: 'Broken', parentId: child }])).toThrow('cycle')
  })
  it('deletes a folder by moving its notebooks and subfolders up, immutably', () => {
    const { library, root, child } = fixture()
    const withRootNote = moveNotebook({ ...library, notebooks: [...library.notebooks, createNotebook('Overview')] }, library.notebooks[0].id, root)
    const before = JSON.stringify(withRootNote)
    const deleted = deleteFolder(withRootNote, root)
    expect(deleted.folders).toEqual([{ ...library.folders[1], parentId: undefined }])
    expect(deleted.notebooks).toHaveLength(2)
    expect(deleted.notebooks[0]).toEqual({ ...withRootNote.notebooks[0], folderId: undefined })
    expect(folderPath(deleted.folders, child).map(folder => folder.name)).toEqual(['Anatomy'])
    expect(JSON.stringify(withRootNote)).toBe(before)
    expect(backupSchema.safeParse(deleted).success).toBe(true)
    const parentRemoved = deleteFolder(library, child)
    expect(parentRemoved.notebooks[0].folderId).toBe(root)
    expect(parentRemoved.notebooks[0].pages).toBe(library.notebooks[0].pages)
  })
  it('rejects deletion with a conflicting subfolder instead of losing or mutating it', () => {
    const { library, root } = fixture()
    const conflicting = addFolder(library, 'Anatomy')
    const before = JSON.stringify(conflicting)
    expect(() => deleteFolder(conflicting, root)).toThrow('already exists')
    expect(JSON.stringify(conflicting)).toBe(before)
  })
  it('accepts old backups and validates folder references, duplicate IDs and cycles', () => {
    const note = createNotebook('Legacy')
    expect(readBackup(JSON.stringify({ format: 'opennotes', version: 1, notebooks: [note] })).folders).toEqual([])
    const { library, root, child } = fixture()
    expect(backupSchema.safeParse({ ...library, folders: [] }).success).toBe(false)
    expect(backupSchema.safeParse({ ...library, folders: [...library.folders, library.folders[0]] }).success).toBe(false)
    expect(backupSchema.safeParse({ ...library, folders: library.folders.map(folder => folder.id === root ? { ...folder, parentId: child } : folder) }).success).toBe(false)
  })
  it('round-trips hierarchy and restores repeatedly without duplicating folders or notebooks', async () => {
    const { library, child } = fixture()
    const incoming = readBackup(JSON.stringify({ ...library, folders: [...library.folders].reverse() }))
    const first = await planBackupRestore(emptyLibrary(), incoming)
    expect(first.added).toBe(1)
    expect(first.library.notebooks[0].folderId).toBe(child)
    expect(backupSchema.safeParse(first.library).success).toBe(true)
    const again = await planBackupRestore(first.library, incoming)
    expect(again.unchanged).toBe(1)
    expect(again.library.folders).toHaveLength(2)
    expect(again.library.notebooks).toHaveLength(1)
    const copies = mergeBackup(first.library, incoming)
    expect(copies.folders).toHaveLength(2)
    expect(copies.notebooks).toHaveLength(2)
    expect(copies.notebooks[1].folderId).toBe(child)
    expect(backupSchema.safeParse(copies).success).toBe(true)
  })
  it('matches regenerated folder IDs by parent/name without conflating equal leaf names', async () => {
    const { library, root, child } = fixture()
    const local = addFolder(addFolder(emptyLibrary(), 'MBBS'), 'PhD')
    const mbbs = local.folders[0].id, phd = local.folders[1].id
    const withChildren = addFolder(addFolder(local, 'Anatomy', mbbs), 'Anatomy', phd)
    const result = await planBackupRestore(withChildren, library)
    expect(result.library.folders).toHaveLength(4)
    expect(result.library.notebooks[0].folderId).toBe(withChildren.folders[2].id)
    expect(result.library.folders.some(folder => folder.id === root || folder.id === child)).toBe(false)
    expect(backupSchema.safeParse(result.library).success).toBe(true)
  })
  it('keeps local organization when newer content is restored or a legacy backup has no folders', async () => {
    const { library, root } = fixture()
    const local = moveNotebook(library, library.notebooks[0].id, root)
    const newer = { ...library, notebooks: [{ ...library.notebooks[0], title: 'New revision', updatedAt: library.notebooks[0].updatedAt + 100 }] }
    const restored = await planBackupRestore(local, newer)
    expect(restored.updated).toBe(1)
    expect(restored.library.notebooks[0]).toMatchObject({ title: 'New revision', folderId: root })
    const legacy = { ...newer, folders: [], notebooks: newer.notebooks.map(note => ({ ...note, folderId: undefined, title: 'Legacy revision', updatedAt: note.updatedAt + 100 })) }
    expect((await planBackupRestore(restored.library, legacy)).library.notebooks[0].folderId).toBe(root)
  })
  it('does not collapse distinct same-name notebooks in the backup or across subjects', async () => {
    const { library, root, child } = fixture()
    const first = { ...createNotebook('Introduction'), folderId: root }
    const second = { ...createNotebook('Introduction'), folderId: child }
    const third = { ...createNotebook('Introduction'), folderId: root }
    const incoming = { ...library, notebooks: [first, second, third] }
    const fresh = await planBackupRestore(emptyLibrary(), incoming)
    expect(fresh.reviews).toHaveLength(0)
    expect(fresh.added).toBe(3)
    expect(fresh.library.notebooks).toHaveLength(3)
    const partial = await planBackupRestore({ ...incoming, notebooks: [first] }, incoming)
    expect(partial.added).toBe(2)
    expect(partial.library.notebooks).toHaveLength(3)
    const distinctSubject = await planBackupRestore({ ...incoming, notebooks: [first] }, { ...incoming, notebooks: [second] })
    expect(distinctSubject.added).toBe(1)
    expect(distinctSubject.reviews).toHaveLength(0)
  })
})
