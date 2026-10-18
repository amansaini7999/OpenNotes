import { emptyLibrary, mergeBackup, type Library, type Notebook } from './model'

export interface RestorePlan {
  base: Library
  library: Library
  added: number
  updated: number
  unchanged: number
  keptNewer: number
  conflicts: number
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function notebookHash(note: Notebook): Promise<string> {
  const assets = new Map(await Promise.all(note.sources.map(async asset =>
    [asset.id, { kind: asset.kind, mime: asset.mime, hash: await sha256(asset.data) }] as const,
  )))
  return sha256(JSON.stringify({
    title: note.title,
    color: note.color,
    pages: note.pages.map(page => ({
      width: page.width, height: page.height, template: page.template,
      background: page.source ? undefined : page.background,
      source: page.source ? { asset: assets.get(page.source.assetId), pageIndex: page.source.pageIndex } : undefined,
      strokes: page.strokes.map(({ id: _id, ...stroke }) => stroke),
    })),
  }))
}

export async function planBackupRestore(base: Library, incoming: Library): Promise<RestorePlan> {
  const notebooks = [...base.notebooks]
  const hashes = new Map<string, string>()
  for (const note of notebooks) hashes.set(note.id, await notebookHash(note))
  const plan: RestorePlan = { base, library: base, added: 0, updated: 0, unchanged: 0, keptNewer: 0, conflicts: 0 }
  for (const note of incoming.notebooks) {
    const hash = await notebookHash(note)
    const index = notebooks.findIndex(local => local.id === note.id)
    if ((index >= 0 && hashes.get(note.id) === hash) || (index < 0 && [...hashes.values()].includes(hash)) ||
        notebooks.some(local => local.backupConflict?.originalId === note.id && local.backupConflict.contentHash === hash)) {
      plan.unchanged++
      continue
    }
    if (index >= 0 && note.updatedAt < notebooks[index].updatedAt) {
      plan.keptNewer++
      continue
    }
    const restored = mergeBackup(emptyLibrary(), { ...emptyLibrary(), notebooks: [note] }).notebooks[0]
    const conflict = index >= 0 && note.updatedAt === notebooks[index].updatedAt
    const candidate = { ...restored, id: conflict ? restored.id : note.id, createdAt: note.createdAt, updatedAt: note.updatedAt, title: conflict ? `${note.title.slice(0, 84)} (conflict copy)` : note.title, ...(conflict ? { backupConflict: { originalId: note.id, contentHash: hash } } : {}) }
    if (conflict) { notebooks.push(candidate); plan.conflicts++ }
    else if (index >= 0) { notebooks[index] = candidate; plan.updated++ }
    else { notebooks.push(candidate); plan.added++ }
    hashes.set(candidate.id, conflict ? await notebookHash(candidate) : hash)
  }
  plan.library = { ...base, notebooks }
  return plan
}
