import { describe, expect, it } from 'vitest'
import { penOutline, penPath } from './ink'
import { temporaryOpacity } from './temporary'
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
  it('uses smooth closed outline paths without modifying raw input', () => {
    const ink = stroke('ballpoint')
    const snapshot = structuredClone(ink)
    const path = penPath(ink)
    expect(path).toMatch(/^M .* Q.* Z$/)
    expect(path).not.toMatch(/NaN|Infinity/)
    expect(penOutline(ink).length).toBeGreaterThan(10)
    expect(ink).toEqual(snapshot)
  })
  it('retains a separate pressure-sensitive style', () => {
    expect(penOutline(stroke('pressure'))).not.toEqual(penOutline(stroke('ballpoint')))
  })
})

describe('temporary presentation ink', () => {
  it('remains visible, fades during the final 700 ms, and is fully gone at expiry', () => {
    expect(temporaryOpacity(5000, 1000)).toBe(1)
    expect(temporaryOpacity(5000, 4650)).toBe(0.5)
    expect(temporaryOpacity(5000, 5000)).toBe(0)
    expect(temporaryOpacity(5000, 6000)).toBe(0)
  })
})
