import { copyNotebook, type Library, type Notebook } from './model'
import { mergeFolderStructure } from './folders'

export interface RestorePlan {
  base: Library
  library: Library
  added: number
  updated: number
  unchanged: number
  keptNewer: number
  conflicts: number
  keptLocal: number
  reviews: RestoreReview[]
}

export type RestoreDecision = 'keep-local' | 'replace-local' | 'separate-copy'
export interface RestoreReview {
  incomingId: string
  title: string
  reason: 'uncertain-identity' | 'same-timestamp'
  candidates: { id: string; title: string }[]
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
      images: page.images.map(({ id: _id, assetId, ...image }) => ({ ...image, asset: assets.get(assetId) })),
    })),
  }))
}

export async function planBackupRestore(base: Library, incoming: Library, decisions: Record<string, RestoreDecision> = {}): Promise<RestorePlan> {
  const { folders, ids } = mergeFolderStructure(base.folders, incoming.folders)
  const notebooks = [...base.notebooks]
  const incomingIds = new Set(incoming.notebooks.map(note => note.id))
  const legacyCandidates = new Set(base.notebooks.filter(note => !incomingIds.has(note.id)).map(note => note.id))
  const hashes = new Map<string, string>()
  for (const note of notebooks) hashes.set(note.id, await notebookHash(note))
  const plan: RestorePlan = { base, library: base, added: 0, updated: 0, unchanged: 0, keptNewer: 0, conflicts: 0, keptLocal: 0, reviews: [] }
  const aliases = (local: Notebook, imported: Notebook) =>
    [...new Set([...(local.backupAliases ?? []), ...(imported.backupAliases ?? []), imported.id])].filter(id => id !== local.id).slice(-1000)
  for (const original of incoming.notebooks) {
    const note = { ...original, folderId: original.folderId ? ids.get(original.folderId) : undefined }
    const hash = await notebookHash(note)
    const exact = notebooks.findIndex(local => local.id === note.id)
    const aliasMatches = notebooks.filter(local => local.backupAliases?.includes(note.id))
    const index = exact >= 0 ? exact : aliasMatches.length === 1 ? notebooks.indexOf(aliasMatches[0]) : -1
    const identical = index >= 0 ? hashes.get(notebooks[index].id) === hash ? index : -1 : notebooks.findIndex(local => legacyCandidates.has(local.id) && local.folderId === note.folderId && hashes.get(local.id) === hash)
    if (identical >= 0 || notebooks.some(local => local.backupConflict?.originalId === note.id && local.backupConflict.contentHash === hash)) {
      if (identical >= 0 && notebooks[identical].id !== note.id) {
        notebooks[identical] = { ...notebooks[identical], backupAliases: aliases(notebooks[identical], note) }
      }
      plan.unchanged++
      continue
    }
    const strokeIds = new Set(note.pages.flatMap(page => page.strokes.map(stroke => stroke.id)))
    const possible = index >= 0 ? [notebooks[index]] : aliasMatches.length ? aliasMatches :
      notebooks.filter(local => legacyCandidates.has(local.id) && ((local.folderId === note.folderId && local.title.trim().toLowerCase() === note.title.trim().toLowerCase()) ||
        local.pages.some(page => page.strokes.some(stroke => strokeIds.has(stroke.id)))))
    const needsReview = (index < 0 && possible.length > 0) || (index >= 0 && note.updatedAt === notebooks[index].updatedAt)
    if (needsReview) {
      plan.reviews.push({ incomingId: note.id, title: note.title, reason: index < 0 ? 'uncertain-identity' : 'same-timestamp', candidates: possible.map(local => ({ id: local.id, title: local.title })) })
      const decision = decisions[note.id]
      if (!decision) continue
      if (decision === 'keep-local') {
        if (possible.length === 1) {
          const localIndex = notebooks.indexOf(possible[0])
          notebooks[localIndex] = { ...possible[0], backupAliases: aliases(possible[0], note) }
        }
        plan.keptLocal++
        continue
      }
      if (decision === 'replace-local' && possible.length !== 1) throw new Error('Multiple notebooks could match this backup. Keep local notebooks or explicitly import a copy instead.')
      const restored = copyNotebook(note)
      if (decision === 'separate-copy') {
        const candidate = { ...restored, createdAt: note.createdAt, updatedAt: note.updatedAt, title: `${note.title.slice(0, 84)} (conflict copy)`, backupConflict: { originalId: note.id, contentHash: hash } }
        notebooks.push(candidate)
        hashes.set(candidate.id, await notebookHash(candidate))
        plan.conflicts++
      } else {
        const local = possible[0]
        const candidate = { ...restored, id: local.id, folderId: local.folderId, createdAt: note.createdAt, updatedAt: note.updatedAt, backupAliases: aliases(local, note) }
        notebooks[notebooks.indexOf(local)] = candidate
        hashes.set(candidate.id, hash)
        plan.updated++
      }
      continue
    }
    if (index >= 0 && note.updatedAt < notebooks[index].updatedAt) {
      plan.keptNewer++
      continue
    }
    const restored = copyNotebook(note)
    const local = index >= 0 ? notebooks[index] : undefined
    const candidate = { ...restored, id: local?.id ?? note.id, folderId: local ? local.folderId : note.folderId, createdAt: note.createdAt, updatedAt: note.updatedAt, backupAliases: local ? aliases(local, note) : note.backupAliases }
    if (index >= 0) { notebooks[index] = candidate; plan.updated++ }
    else { notebooks.push(candidate); plan.added++ }
    hashes.set(candidate.id, hash)
  }
  plan.library = { ...base, folders, notebooks }
  return plan
}
