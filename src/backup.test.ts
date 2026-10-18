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
  it('preserves equal-age divergent notebooks as explicit conflict copies', async () => {
    const note = createNotebook('Notes')
    const base = { ...emptyLibrary(), notebooks: [note] }
    const incoming = { ...base, notebooks: [{ ...note, color: '#123456' }] }
    const plan = await planBackupRestore(base, incoming)
    expect(plan.conflicts).toBe(1)
    expect(plan.library.notebooks).toHaveLength(2)
    expect(plan.library.notebooks[0]).toBe(note)
    expect(plan.library.notebooks[1].title).toContain('conflict copy')
    const repeated = await planBackupRestore(plan.library, incoming)
    expect(repeated.unchanged).toBe(1)
    expect(repeated.library.notebooks).toHaveLength(2)
  })
})
