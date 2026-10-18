import { z } from 'zod'

export const PAGE_WIDTH = 794
export const PAGE_HEIGHT = 1123
export const colors = ['#253a43', '#327769', '#517bcb', '#ba6066', '#d5a24c', '#8c6bb1']
export const coverColors = ['#327769', '#4b668c', '#ad6863', '#b39464', '#807397', '#51655d']
export type Tool = 'pen' | 'highlighter' | 'eraser' | 'hand'

const pointSchema = z.object({
  x: z.number().finite().min(-100).max(2100),
  y: z.number().finite().min(-100).max(3100),
  pressure: z.number().min(0).max(1),
})
const strokeSchema = z.object({
  id: z.string().uuid(),
  tool: z.enum(['pen', 'highlighter']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().min(0.5).max(40),
  points: z.array(pointSchema).min(1),
})
const backgroundSchema = z.string().max(8_000_000).regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/)
const sourceAssetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['pdf', 'image']),
  mime: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  data: z.string().min(4).max(45_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  pageCount: z.number().int().min(1).max(50),
}).refine(asset => asset.kind === 'pdf' ? asset.mime === 'application/pdf' : asset.mime !== 'application/pdf' && asset.pageCount === 1, 'Invalid source asset type.')
const pageSchema = z.object({
  id: z.string().uuid(),
  template: z.enum(['dotted', 'ruled', 'plain']),
  width: z.number().min(100).max(2000),
  height: z.number().min(100).max(3000),
  background: backgroundSchema.optional(),
  source: z.object({ assetId: z.string().uuid(), pageIndex: z.number().int().min(0).max(49) }).optional(),
  strokes: z.array(strokeSchema),
})
const notebookSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  createdAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
  pages: z.array(pageSchema).min(1).max(500),
  sources: z.array(sourceAssetSchema).default([]),
  backupConflict: z.object({ originalId: z.string().uuid(), contentHash: z.string().regex(/^[0-9a-f]{64}$/) }).optional(),
})
export const backupSchema = z.object({
  format: z.literal('opennotes'),
  version: z.literal(1),
  notebooks: z.array(notebookSchema),
}).superRefine((library, context) => {
  const notebooks = new Set<string>(), pages = new Set<string>(), assets = new Set<string>()
  for (const notebook of library.notebooks) {
    if (notebooks.has(notebook.id)) context.addIssue({ code: 'custom', message: 'Duplicate notebook identifier.' })
    notebooks.add(notebook.id)
    const sources = new Map(notebook.sources.map(asset => [asset.id, asset]))
    for (const asset of notebook.sources) {
      if (assets.has(asset.id)) context.addIssue({ code: 'custom', message: 'Duplicate source asset identifier.' })
      assets.add(asset.id)
    }
    for (const page of notebook.pages) {
      if (page.source) {
        const asset = sources.get(page.source.assetId)
        if (!asset || page.source.pageIndex >= asset.pageCount) context.addIssue({ code: 'custom', message: 'Invalid page source reference.' })
      }
      if (pages.has(page.id)) context.addIssue({ code: 'custom', message: 'Duplicate page identifier.' })
      pages.add(page.id)
      const strokes = new Set<string>()
      for (const stroke of page.strokes) {
        if (strokes.has(stroke.id)) context.addIssue({ code: 'custom', message: 'Duplicate stroke identifier.' })
        strokes.add(stroke.id)
      }
    }
  }
})
export type Point = z.infer<typeof pointSchema>
export type Stroke = z.infer<typeof strokeSchema>
export type NotePage = z.infer<typeof pageSchema>
export type Notebook = z.infer<typeof notebookSchema>
export type Library = z.infer<typeof backupSchema>
export type Template = NotePage['template']
export type SourceAsset = z.infer<typeof sourceAssetSchema>
export type ImportedPages = { pages: NotePage[]; sources: SourceAsset[] }

export function createPage(template: Template = 'dotted'): NotePage {
  return { id: crypto.randomUUID(), template, width: PAGE_WIDTH, height: PAGE_HEIGHT, strokes: [] }
}

export function createNotebook(title: string, color = coverColors[0], template: Template = 'dotted'): Notebook {
  const now = Date.now()
  return { id: crypto.randomUUID(), title, color, createdAt: now, updatedAt: now, pages: [createPage(template)], sources: [] }
}

export function insertPagesAfter(notebook: Notebook, afterId: string, pages: NotePage[], sources: SourceAsset[] = []): Notebook {
  const index = notebook.pages.findIndex(page => page.id === afterId)
  if (index < 0) throw new Error('The selected page no longer exists. Select another page and retry.')
  if (!pages.length) throw new Error('The selected files did not contain any pages.')
  if (notebook.pages.length + pages.length > 500) throw new Error('A notebook can contain up to 500 pages. Import fewer pages or use another notebook.')
  const ids = new Set(notebook.pages.map(page => page.id))
  for (const page of pages) {
    if (ids.has(page.id)) throw new Error('Duplicate page identifier. Please retry the import.')
    ids.add(page.id)
  }
  return {
    ...notebook,
    updatedAt: Date.now(),
    pages: [...notebook.pages.slice(0, index + 1), ...pages, ...notebook.pages.slice(index + 1)],
    sources: [...notebook.sources, ...sources],
  }
}

export function emptyLibrary(): Library {
  return { format: 'opennotes', version: 1, notebooks: [] }
}

export function readBackup(text: string): Library {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON. Choose an OpenNotes .opennotes backup.')
  }
  const result = backupSchema.safeParse(data)
  if (!result.success) throw new Error('This is not a supported OpenNotes backup, or its contents exceed the supported limits.')
  return result.data
}

export function mergeBackup(library: Library, imported: Library): Library {
  const now = Date.now()
  return {
    ...library,
    notebooks: [
      ...library.notebooks,
      ...imported.notebooks.map(note => {
        const ids = new Map(note.sources.map(asset => [asset.id, crypto.randomUUID()]))
        return {
          ...note,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          sources: note.sources.map(asset => ({ ...asset, id: ids.get(asset.id)! })),
          pages: note.pages.map(page => ({
            ...page,
            id: crypto.randomUUID(),
            ...(page.source ? { source: { ...page.source, assetId: ids.get(page.source.assetId)! } } : {}),
          })),
        }
      }),
    ],
  }
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy)
}

export function pressureWidth(width: number, pressure: number): number {
  return width * (0.35 + Math.max(0, Math.min(1, pressure)) * 0.9)
}

export function safeFilename(title: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 90) || 'OpenNotes'
}
