import { describe, expect, it } from 'vitest'
import { penOutline, penPath } from './ink'
import { temporaryFrame, temporaryOpacity } from './temporary'
import type { Stroke } from './model'

function stroke(style: 'ballpoint' | 'pressure'): Stroke {
  return {
    id: crypto.randomUUID(), tool: 'pen', color: '#253a43', width: 4, penStyle: style,
    points: Array.from({ length: 30 }, (_, index) => ({ x: 20 + index * 8, y: 40, pressure: index % 2 ? 1 : 0 })),
  }
}

describe('smooth pen geometry', () => {
  it('keeps ballpoint width steady even when pressure samples alternate sharply', () => {
    const outline = penOutline(stroke('ballpoint'))
    const thickness = Math.max(...outline.map(point => point[1])) - Math.min(...outline.map(point => point[1]))
    expect(thickness).toBeCloseTo(4, 1)
  })
  it('uses a single connected quadratic ballpoint path without modifying raw input', () => {
    const ink = stroke('ballpoint')
    const snapshot = structuredClone(ink)
    const path = penPath(ink)
    expect(path).toMatch(/^M .* Q.* L/)
    expect(path.match(/M /g)).toHaveLength(1)
    expect(path).not.toContain('Z')
    expect(path).not.toMatch(/NaN|Infinity/)
    expect(penOutline(ink).length).toBeGreaterThan(10)
    expect(ink).toEqual(snapshot)
  })
  it('retains a separate pressure-sensitive style', () => {
    expect(penOutline(stroke('pressure'))).not.toEqual(penOutline(stroke('ballpoint')))
    expect(penPath(stroke('pressure'))).toMatch(/ Z$/)
  })
  it('unifies legacy pressure segments in a single filled path without changing their data', () => {
    const ink = { ...stroke('pressure'), penStyle: undefined }
    const before = structuredClone(ink)
    expect(penPath(ink).match(/ Z/g)).toHaveLength(29)
    expect(penPath(ink)).not.toMatch(/NaN|Infinity/)
    expect(ink).toEqual(before)
  })
  it('ignores duplicate samples when building the ballpoint curve, not in saved data', () => {
    const ink = stroke('ballpoint')
    const duplicate = { ...ink, points: ink.points.flatMap(point => [point, point]) }
    expect(penPath(duplicate)).toBe(penPath(ink))
    expect(duplicate.points).toHaveLength(60)
  })
})

describe('temporary presentation ink', () => {
  it('fades smoothly during the final second and is fully gone at expiry', () => {
    expect(temporaryOpacity(5000, 1000)).toBe(1)
    expect(temporaryOpacity(5000, 4500)).toBe(0.5)
    expect(temporaryOpacity(5000, 4750)).toBeCloseTo(0.15625)
    expect(temporaryOpacity(5000, 5000)).toBe(0)
    expect(temporaryOpacity(5000, 6000)).toBe(0)
  })
  it('shrinks old trail samples during a long stroke without restarting their lifetime on release', () => {
    const ink = stroke('ballpoint')
    ink.points = [{ x: 0, y: 40, pressure: 0.5 }, { x: 100, y: 40, pressure: 0.5 }, { x: 200, y: 40, pressure: 0.5 }]
    const entry = { stroke: ink, pointTimes: [0, 1000, 2000], lifetime: 2000, expiresAt: 4000 }
    expect(temporaryFrame(entry, 1500)).toBe(ink)
    expect(temporaryFrame(entry, 2500)?.points[0].x).toBe(50)
    expect(temporaryFrame(entry, 3500)?.points[0].x).toBe(150)
    expect(temporaryFrame(entry, 4000)).toBeNull()
    expect(ink.points).toHaveLength(3)
  })
})
