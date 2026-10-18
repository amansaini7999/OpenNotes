import { describe, expect, it } from 'vitest'
import { eraseInk, eraseStrokePoints } from './eraser'
import { backupSchema, createNotebook, emptyLibrary, type Point, type Stroke } from './model'

const point = (x: number, y: number, pressure = 0.5): Point => ({ x, y, pressure })
const stroke = (points: Point[], tool: Stroke['tool'] = 'pen'): Stroke => ({
  id: crypto.randomUUID(), tool, color: '#253a43', width: 2, points,
})

describe('area eraser', () => {
  it('cuts the middle of a sparsely sampled stroke without deleting its ends', () => {
    const original = stroke([point(0, 50), point(100, 50)])
    const result = eraseInk([original], [point(50, 0), point(50, 100)], 5)
    expect(result).toHaveLength(2)
    expect(result[0].points[0]).toEqual(original.points[0])
    expect(result[0].points.at(-1)!.x).toBeCloseTo(44.2)
    expect(result[1].points[0].x).toBeCloseTo(55.8)
    expect(result[1].points.at(-1)).toEqual(original.points[1])
    expect(result[0].id).toBe(original.id)
    expect(result[1].id).not.toBe(original.id)
  })
  it('interpolates pressure at newly cut endpoints', () => {
    const result = eraseStrokePoints(stroke([point(0, 0, 0.1), point(100, 0, 0.9)]), [point(50, 0)], 5)!
    expect(result).toHaveLength(2)
    expect(result[0].at(-1)!.pressure).toBeCloseTo(0.1 + result[0].at(-1)!.x * 0.008)
    expect(result[1][0].pressure).toBeCloseTo(0.1 + result[1][0].x * 0.008)
  })
  it('preserves object identities when no ink is hit', () => {
    const original = [stroke([point(0, 0), point(100, 0)])]
    expect(eraseInk(original, [point(50, 100)], 5)).toBe(original)
    expect(eraseInk(original, [], 5)).toBe(original)
  })
  it('does not mutate source points or strokes', () => {
    const original = [stroke([point(0, 0), point(100, 0)])]
    const snapshot = structuredClone(original)
    eraseInk(original, [point(50, 0)], 5)
    expect(original).toEqual(snapshot)
  })
  it('erases dots and entire short strokes when covered', () => {
    expect(eraseInk([stroke([point(10, 10)])], [point(10, 12)], 3)).toEqual([])
    expect(eraseInk([stroke([point(10, 10), point(15, 10)])], [point(12, 10)], 10)).toEqual([])
  })
  it('merges overlapping eraser samples without creating duplicate fragments', () => {
    const result = eraseInk([stroke([point(0, 0), point(100, 0)])], [point(45, 0), point(50, 0), point(55, 0)], 5)
    expect(result).toHaveLength(2)
    expect(result[0].points.at(-1)!.x).toBeLessThan(40)
    expect(result[1].points[0].x).toBeGreaterThan(60)
  })
  it('retains connected segments on either side of a cut', () => {
    const result = eraseInk([stroke([point(0, 0), point(25, 0), point(50, 0), point(75, 0), point(100, 0)])], [point(50, 0)], 5)
    expect(result).toHaveLength(2)
    expect(result[0].points.some(p => p.x === 25)).toBe(true)
    expect(result[1].points.some(p => p.x === 75)).toBe(true)
  })
  it('handles diagonal eraser travel between samples', () => {
    const result = eraseInk([stroke([point(0, 50), point(100, 50)])], [point(0, 0), point(100, 100)], 4)
    expect(result).toHaveLength(2)
    expect(result[0].points.at(-1)!.x).toBeLessThan(50)
    expect(result[1].points[0].x).toBeGreaterThan(50)
  })
  it('removes only the touched portion of a wide highlighter', () => {
    const original = { ...stroke([point(0, 20), point(100, 20)], 'highlighter'), width: 8 }
    const result = eraseInk([original], [point(50, 39)], 2)
    expect(result).toHaveLength(2)
    expect(result.every(part => part.tool === 'highlighter' && part.width === 8)).toBe(true)
  })
  it('creates valid backups after repeated splitting and handles zero-length segments', () => {
    const notebook = createNotebook('Erased ink')
    const ink = stroke([point(0, 0), point(0, 0), point(100, 0)])
    notebook.pages[0].strokes = eraseInk(eraseInk([ink], [point(25, 0)], 3), [point(75, 0)], 3)
    expect(notebook.pages[0].strokes).toHaveLength(3)
    expect(backupSchema.safeParse({ ...emptyLibrary(), notebooks: [notebook] }).success).toBe(true)
  })
})
