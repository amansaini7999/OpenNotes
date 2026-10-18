import { describe, expect, it } from 'vitest'
import { notebookHash, planBackupRestore } from './backup'
import { createNotebook, emptyLibrary, mergeBackup } from './model'

describe('idempotent backup restore', () => {
  it('skips an identical backup instead of duplicating notebooks', async () => {
    const library = { ...emptyLibrary(), notebooks: [createNotebook('Notes')] }
    const plan = await planBackupRestore(library, library)
    expect(plan.unchanged).toBe(1)
    expect(plan.library.notebooks).toHaveLength(1)
    expect(plan.library.notebooks[0]).toBe(library.notebooks[0])
  })
  it('recognizes old re-identified copies by content rather than generated ids', async () => {
    const library = { ...emptyLibrary(), notebooks: [createNotebook('Notes')] }
    const copies = mergeBackup(emptyLibrary(), library)
    expect(await notebookHash(library.notebooks[0])).toBe(await notebookHash(copies.notebooks[0]))
    expect((await planBackupRestore(library, copies)).unchanged).toBe(1)
  })
  it('plans newer replacements but retains newer local content', async () => {
    const note = createNotebook('Old')
    const base = { ...emptyLibrary(), notebooks: [note] }
    const incoming = { ...base, notebooks: [{ ...note, title: 'New', updatedAt: note.updatedAt + 1000 }] }
    const newer = await planBackupRestore(base, incoming)
    expect(newer.updated).toBe(1)
    expect(newer.library.notebooks[0].id).toBe(note.id)
    expect(newer.library.notebooks[0].title).toBe('New')
    expect((await planBackupRestore(incoming, base)).keptNewer).toBe(1)
    expect(base.notebooks[0].title).toBe('Old')
  })
  it('restores the deleted notebook and keeps the edited survivor without creating a third notebook', async () => {
    const first = createNotebook('First'), second = createNotebook('Second')
    const backup = { ...emptyLibrary(), notebooks: [first, second] }
    const survivor = { ...second, updatedAt: second.updatedAt + 1000, pages: [{ ...second.pages[0], template: 'ruled' as const }] }
    const local = { ...emptyLibrary(), notebooks: [survivor] }
    const plan = await planBackupRestore(local, backup)
    expect(plan.added).toBe(1)
    expect(plan.keptNewer).toBe(1)
    expect(plan.library.notebooks).toHaveLength(2)
    expect(plan.library.notebooks.find(note => note.id === second.id)).toBe(survivor)
    expect((await planBackupRestore(plan.library, backup)).library.notebooks).toHaveLength(2)
  })
  it('does not create a third notebook when the edited survivor has a legacy regenerated ID', async () => {
    const first = createNotebook('First'), second = createNotebook('Second')
    const backup = { ...emptyLibrary(), notebooks: [first, second] }
    const survivor = mergeBackup(emptyLibrary(), { ...emptyLibrary(), notebooks: [second] }).notebooks[0]
    survivor.pages[0].template = 'ruled'
    survivor.updatedAt = second.updatedAt + 1000
    const plan = await planBackupRestore({ ...emptyLibrary(), notebooks: [survivor] }, backup)
    expect(plan.library.notebooks).toHaveLength(2)
    expect(plan.reviews).toHaveLength(1)
    expect(plan.reviews[0].incomingId).toBe(second.id)
    const resolved = await planBackupRestore(plan.base, backup, { [second.id]: 'keep-local' })
    expect(resolved.keptLocal).toBe(1)
    expect(resolved.library.notebooks.find(note => note.id === survivor.id)!.pages[0].template).toBe('ruled')
    expect(resolved.library.notebooks.find(note => note.id === survivor.id)!.backupAliases).toContain(second.id)
    const repeated = await planBackupRestore(resolved.library, backup)
    expect(repeated.reviews).toHaveLength(0)
    expect(repeated.library.notebooks).toHaveLength(2)
  })
  it('requires an explicit choice before creating an equal-age conflict copy', async () => {
    const note = createNotebook('Notes')
    const base = { ...emptyLibrary(), notebooks: [note] }
    const incoming = { ...base, notebooks: [{ ...note, color: '#123456' }] }
    const plan = await planBackupRestore(base, incoming)
    expect(plan.conflicts).toBe(0)
    expect(plan.library.notebooks).toHaveLength(1)
    expect(plan.library.notebooks[0]).toBe(note)
    expect(plan.reviews).toHaveLength(1)
    const repeated = await planBackupRestore(plan.library, incoming)
    expect(repeated.library.notebooks).toHaveLength(1)
    const copied = await planBackupRestore(base, incoming, { [note.id]: 'separate-copy' })
    expect(copied.conflicts).toBe(1)
    expect(copied.library.notebooks).toHaveLength(2)
    expect((await planBackupRestore(copied.library, incoming)).unchanged).toBe(1)
    const replaced = await planBackupRestore(base, incoming, { [note.id]: 'replace-local' })
    expect(replaced.library.notebooks).toHaveLength(1)
    expect(replaced.library.notebooks[0].id).toBe(note.id)
    expect(replaced.library.notebooks[0].color).toBe('#123456')
  })
  it('reviews renamed legacy versions with shared ink identifiers rather than adding an automatic copy', async () => {
    const note = createNotebook('Original name')
    note.pages[0].strokes.push({ id: crypto.randomUUID(), tool: 'pen', color: '#123456', width: 3, points: [{ x: 10, y: 10, pressure: 0.5 }] })
    const legacy = mergeBackup(emptyLibrary(), { ...emptyLibrary(), notebooks: [note] }).notebooks[0]
    legacy.title = 'Renamed locally'
    legacy.pages[0].strokes = [...legacy.pages[0].strokes, { ...legacy.pages[0].strokes[0], id: crypto.randomUUID() }]
    const plan = await planBackupRestore({ ...emptyLibrary(), notebooks: [legacy] }, { ...emptyLibrary(), notebooks: [note] })
    expect(plan.reviews).toHaveLength(1)
    expect(plan.library.notebooks).toHaveLength(1)
  })
  it('never replaces one of several same-name candidates without an unambiguous choice', async () => {
    const a = createNotebook('Shared name'), b = createNotebook('Shared name'), incoming = createNotebook('Shared name')
    a.pages[0].template = 'plain'
    b.pages[0].template = 'ruled'
    const base = { ...emptyLibrary(), notebooks: [a, b] }
    const backup = { ...emptyLibrary(), notebooks: [incoming] }
    const plan = await planBackupRestore(base, backup)
    expect(plan.reviews[0].candidates).toHaveLength(2)
    expect(plan.library.notebooks).toHaveLength(2)
    await expect(planBackupRestore(base, backup, { [incoming.id]: 'replace-local' })).rejects.toThrow('Multiple notebooks')
  })
})
