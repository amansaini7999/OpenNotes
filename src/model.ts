import { z } from 'zod'
import { mergeFolderStructure } from './folders'
import { MAX_NOTEBOOK_PAGES, MAX_PDF_PAGES } from './limits'
import { isBase64 } from './assets'

export const PAGE_WIDTH = 794
export const PAGE_HEIGHT = 1123
export const colors = ['#253a43', '#327769', '#517bcb', '#ba6066', '#d5a24c', '#8c6bb1']
export const coverColors = ['#327769', '#4b668c', '#ad6863', '#b39464', '#807397', '#51655d']
export type Tool = 'pen' | 'highlighter' | 'eraser' | 'hand' | 'image' | 'temporary'
export type PenStyle = 'ballpoint' | 'pressure'

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
  penStyle: z.enum(['ballpoint', 'pressure']).optional(),
  points: z.array(pointSchema).min(1),
})
const backgroundSchema = z.string().max(8_000_000).refine(value => {
  const header = /^data:image\/(?:png|jpeg);base64,/.exec(value)
  return Boolean(header && isBase64(value.slice(header[0].length)))
})
const sourceAssetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['pdf', 'image']),
  mime: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  data: z.string().min(4).max(45_000_000).refine(isBase64),
  pageCount: z.number().int().min(1).max(MAX_PDF_PAGES),
}).refine(asset => asset.kind === 'pdf' ? asset.mime === 'application/pdf' : asset.mime !== 'application/pdf' && asset.pageCount === 1, 'Invalid source asset type.')
const placedImageSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  x: z.number().finite().min(0).max(2000),
  y: z.number().finite().min(0).max(3000),
  width: z.number().finite().min(10).max(2000),
  height: z.number().finite().min(10).max(3000),
})
const pageSchema = z.object({
  id: z.string().uuid(),
  template: z.enum(['dotted', 'ruled', 'plain']),
  width: z.number().min(100).max(2000),
  height: z.number().min(100).max(3000),
  background: backgroundSchema.optional(),
  source: z.object({ assetId: z.string().uuid(), pageIndex: z.number().int().min(0).max(MAX_PDF_PAGES - 1) }).optional(),
  strokes: z.array(strokeSchema),
  images: z.array(placedImageSchema).max(100).default([]),
})
const notebookSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  createdAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
  pages: z.array(pageSchema).min(1).max(MAX_NOTEBOOK_PAGES),
  sources: z.array(sourceAssetSchema).default([]),
  backupConflict: z.object({ originalId: z.string().uuid(), contentHash: z.string().regex(/^[0-9a-f]{64}$/) }).optional(),
  backupAliases: z.array(z.string().uuid()).max(1000).optional(),
  folderId: z.string().uuid().optional(),
})
const folderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().optional(),
})
export const backupSchema = z.object({
  format: z.literal('opennotes'),
  version: z.literal(1),
  notebooks: z.array(notebookSchema),
  folders: z.array(folderSchema).max(1000).default([]),
}).superRefine((library, context) => {
  const folders = new Map(library.folders.map(folder => [folder.id, folder]))
  const siblings = new Set<string>()
  for (const folder of library.folders) {
    const key = JSON.stringify([folder.parentId, folder.name.normalize('NFKC').toLowerCase()])
    if (siblings.has(key)) context.addIssue({ code: 'custom', message: 'Folders in the same location need different names.' })
    siblings.add(key)
    const seen = new Set([folder.id])
    let parent = folder.parentId
    while (parent) {
      if (!folders.has(parent) || seen.has(parent)) {
        context.addIssue({ code: 'custom', message: 'Folders cannot contain themselves or reference missing parents.' })
        break
      }
      seen.add(parent)
      parent = folders.get(parent)!.parentId
    }
  }
  if (folders.size !== library.folders.length) context.addIssue({ code: 'custom', message: 'Duplicate folder identifier.' })
  const notebooks = new Set<string>(), pages = new Set<string>(), assets = new Set<string>()
  for (const notebook of library.notebooks) {
    if (notebook.folderId && !folders.has(notebook.folderId)) context.addIssue({ code: 'custom', message: 'A notebook references a missing folder.' })
    if (notebooks.has(notebook.id)) context.addIssue({ code: 'custom', message: 'Duplicate notebook identifier.' })
    notebooks.add(notebook.id)
    const sources = new Map(notebook.sources.map(asset => [asset.id, asset]))
    for (const asset of notebook.sources) {
      if (assets.has(asset.id)) context.addIssue({ code: 'custom', message: 'Duplicate source asset identifier.' })
      assets.add(asset.id)
    }
    for (const page of notebook.pages) {
      const imageIds = new Set<string>()
      for (const image of page.images) {
        if (imageIds.has(image.id) || sources.get(image.assetId)?.kind !== 'image' || image.x + image.width > page.width + 0.01 || image.y + image.height > page.height + 0.01) {
          context.addIssue({ code: 'custom', message: 'Invalid inline image reference or position.' })
        }
        imageIds.add(image.id)
      }
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
export type Folder = z.infer<typeof folderSchema>
export type Template = NotePage['template']
export type SourceAsset = z.infer<typeof sourceAssetSchema>
export type ImportedPages = { pages: NotePage[]; sources: SourceAsset[] }
export type PlacedImage = z.infer<typeof placedImageSchema>

export function createPage(template: Template = 'dotted'): NotePage {
  return { id: crypto.randomUUID(), template, width: PAGE_WIDTH, height: PAGE_HEIGHT, strokes: [], images: [] }
}

export function createNotebook(title: string, color = coverColors[0], template: Template = 'dotted'): Notebook {
  const now = Date.now()
  return { id: crypto.randomUUID(), title, color, createdAt: now, updatedAt: now, pages: [createPage(template)], sources: [] }
}

export function insertPagesAfter(notebook: Notebook, afterId: string, pages: NotePage[], sources: SourceAsset[] = []): Notebook {
  const index = notebook.pages.findIndex(page => page.id === afterId)
  if (index < 0) throw new Error('The selected page no longer exists. Select another page and retry.')
  if (!pages.length) throw new Error('The selected files did not contain any pages.')
  if (notebook.pages.length + pages.length > MAX_NOTEBOOK_PAGES) throw new Error(`A notebook can contain up to ${MAX_NOTEBOOK_PAGES.toLocaleString('en-US')} pages. Import fewer pages or use another notebook.`)
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
  return { format: 'opennotes', version: 1, notebooks: [], folders: [] }
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

export function copyNotebook(note: Notebook): Notebook {
  const now = Date.now()
  const ids = new Map(note.sources.map(asset => [asset.id, crypto.randomUUID()]))
  return {
    ...note,
    id: crypto.randomUUID(),
    backupAliases: undefined,
    backupConflict: undefined,
    createdAt: now,
    updatedAt: now,
    sources: note.sources.map(asset => ({ ...asset, id: ids.get(asset.id)! })),
    pages: note.pages.map(page => ({
      ...page,
      id: crypto.randomUUID(),
      images: page.images.map(image => ({ ...image, id: crypto.randomUUID(), assetId: ids.get(image.assetId)! })),
      ...(page.source ? { source: { ...page.source, assetId: ids.get(page.source.assetId)! } } : {}),
    })),
  }
}

export function mergeBackup(library: Library, imported: Library): Library {
  const { folders, ids } = mergeFolderStructure(library.folders, imported.folders)
  return {
    ...library,
    folders,
    notebooks: [
      ...library.notebooks,
      ...imported.notebooks.map(note => ({ ...copyNotebook(note), folderId: note.folderId ? ids.get(note.folderId) : undefined })),
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

export function isDotStroke(stroke: Pick<Stroke, 'points'>): boolean {
  const first = stroke.points[0]
  return Boolean(first) && stroke.points.every(point => point.x === first.x && point.y === first.y)
}

export function dotRadius(stroke: Stroke): number {
  const pressure = stroke.points.reduce((maximum, point) => Math.max(maximum, point.pressure), 0)
  return strokeRadiusAt(stroke, pressure)
}

export function strokeRadiusAt(stroke: Stroke, pressure: number): number {
  if (stroke.tool === 'highlighter') return stroke.width * 2.5
  if (stroke.penStyle === 'ballpoint') return stroke.width / 2
  if (stroke.penStyle === 'pressure') return stroke.width * (0.75 + 0.5 * Math.max(0, Math.min(1, pressure))) / 2
  return pressureWidth(stroke.width, pressure) / 2
}

export function safeFilename(title: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 90) || 'OpenNotes'
}
