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
const pageSchema = z.object({
  id: z.string().uuid(),
  template: z.enum(['dotted', 'ruled', 'plain']),
  width: z.number().min(100).max(2000),
  height: z.number().min(100).max(3000),
  background: backgroundSchema.optional(),
  strokes: z.array(strokeSchema),
})
const notebookSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  createdAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
  pages: z.array(pageSchema).min(1).max(500),
})
export const backupSchema = z.object({
  format: z.literal('opennotes'),
  version: z.literal(1),
  notebooks: z.array(notebookSchema),
}).superRefine((library, context) => {
  const notebooks = new Set<string>(), pages = new Set<string>()
  for (const notebook of library.notebooks) {
    if (notebooks.has(notebook.id)) context.addIssue({ code: 'custom', message: 'Duplicate notebook identifier.' })
    notebooks.add(notebook.id)
    for (const page of notebook.pages) {
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

export function createPage(template: Template = 'dotted'): NotePage {
  return { id: crypto.randomUUID(), template, width: PAGE_WIDTH, height: PAGE_HEIGHT, strokes: [] }
}

export function createNotebook(title: string, color = coverColors[0], template: Template = 'dotted'): Notebook {
  const now = Date.now()
  return { id: crypto.randomUUID(), title, color, createdAt: now, updatedAt: now, pages: [createPage(template)] }
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
      ...imported.notebooks.map(note => ({
        ...note,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        pages: note.pages.map(page => ({ ...page, id: crypto.randomUUID() })),
      })),
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
