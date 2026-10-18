import { describe, expect, it } from 'vitest'
import { backupSchema, createNotebook, createPage, distanceToSegment, emptyLibrary, eraseStrokes, mergeBackup, pressureWidth, readBackup, safeFilename, type Point, type Stroke } from './model'

const point = (x: number, y: number): Point => ({ x, y, pressure: 0.5 })
const stroke = (points: Point[]): Stroke => ({ id: crypto.randomUUID(), tool: 'pen', color: '#253a43', width: 3, points })

describe('document model', () => {
  it('creates independently identified notebooks and pages', () => {
    const a = createNotebook('Field notes'), b = createNotebook('Field notes')
    expect(a.id).not.toBe(b.id)
    expect(a.pages[0].id).not.toBe(b.pages[0].id)
    expect(backupSchema.safeParse({ ...emptyLibrary(), notebooks: [a, b] }).success).toBe(true)
  })
  it('round-trips editable backups', () => {
    const note = createNotebook('Ideas')
    note.pages[0].strokes = [stroke([point(10, 10), point(90, 90)])]
    const data = { ...emptyLibrary(), notebooks: [note] }
    expect(readBackup(JSON.stringify(data))).toEqual(data)
  })
  it('rejects malformed, unsupported, non-finite and unsafe image data', () => {
    expect(() => readBackup('not json')).toThrow('not valid JSON')
    expect(() => readBackup('{"version":2}')).toThrow('not a supported')
    const note = createNotebook('Test')
    const data = { ...emptyLibrary(), notebooks: [note] }
    note.pages[0].background = 'data:image/svg+xml;base64,PHN2Zz4='
    expect(() => readBackup(JSON.stringify(data))).toThrow('not a supported')
    note.pages[0].background = undefined
    note.pages[0].strokes = [stroke([{ x: Infinity, y: 0, pressure: 0.5 }])]
    expect(backupSchema.safeParse(data).success).toBe(false)
  })
  it('imports without overwriting existing notebooks or reusing page ids', () => {
    const note = createNotebook('Original')
    const original = { ...emptyLibrary(), notebooks: [note] }
    const merged = mergeBackup(original, original)
    expect(original.notebooks).toHaveLength(1)
    expect(merged.notebooks).toHaveLength(2)
    expect(merged.notebooks[1].id).not.toBe(note.id)
    expect(merged.notebooks[1].pages[0].id).not.toBe(note.pages[0].id)
  })
  it('sanitizes exported filenames', () => {
    expect(safeFilename('A/B:C?')).toBe('A-B-C-')
    expect(safeFilename('')).toBe('OpenNotes')
  })
  it('rejects colliding page identifiers before normalized storage can overwrite data', () => {
    const a = createNotebook('One'), b = createNotebook('Two')
    b.pages[0].id = a.pages[0].id
    expect(() => readBackup(JSON.stringify({ ...emptyLibrary(), notebooks: [a, b] }))).toThrow('not a supported')
  })
  it('validates page dimensions and pressure limits', () => {
    const note = createNotebook('Test')
    note.pages[0] = { ...createPage(), height: 100000 }
    expect(backupSchema.safeParse({ ...emptyLibrary(), notebooks: [note] }).success).toBe(false)
  })
})

describe('ink geometry', () => {
  it('measures the closest point on a line segment, including a dot', () => {
    expect(distanceToSegment(point(5, 4), point(0, 0), point(10, 0))).toBe(4)
    expect(distanceToSegment(point(13, 4), point(0, 0), point(10, 0))).toBe(5)
    expect(distanceToSegment(point(3, 4), point(0, 0), point(0, 0))).toBe(5)
  })
  it('erases intersections between samples rather than only sampled points', () => {
    const hit = stroke([point(0, 50), point(100, 50)])
    const keep = stroke([point(200, 200), point(300, 200)])
    expect(eraseStrokes([hit, keep], [point(50, 0), point(50, 100)], 3)).toEqual([keep])
  })
  it('erases dots and respects nearby stroke width', () => {
    const dot = stroke([point(10, 10)])
    expect(eraseStrokes([dot], [point(10, 12)], 2)).toEqual([])
    expect(eraseStrokes([dot], [point(50, 50)], 2)).toEqual([dot])
  })
  it('does not mutate original strokes', () => {
    const ink = [stroke([point(0, 0), point(10, 10)])]
    eraseStrokes(ink, [point(5, 5)], 3)
    expect(ink).toHaveLength(1)
    expect(ink[0].points).toHaveLength(2)
  })
  it('erases the visible edges of a wide highlighter', () => {
    const marker: Stroke = { ...stroke([point(10, 20), point(100, 20)]), tool: 'highlighter', width: 8 }
    expect(eraseStrokes([marker], [point(50, 39)], 1)).toEqual([])
  })
  it('maps pressure to positive bounded widths', () => {
    expect(pressureWidth(4, 0)).toBeCloseTo(1.4)
    expect(pressureWidth(4, 1)).toBeCloseTo(5)
    expect(pressureWidth(4, -2)).toBe(pressureWidth(4, 0))
    expect(pressureWidth(4, 3)).toBe(pressureWidth(4, 1))
  })
})
