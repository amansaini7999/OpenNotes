import { describe, expect, it } from 'vitest'
import { horizontalPageTurn, usesTabletLayout } from './navigation'

describe('device-specific notebook defaults', () => {
  it('recognizes iPad including desktop browser identification without treating laptops as tablets', () => {
    expect(usesTabletLayout('iPad', 'iPad', 5, true)).toBe(true)
    expect(usesTabletLayout('Macintosh', 'MacIntel', 5, false)).toBe(true)
    expect(usesTabletLayout('Macintosh', 'MacIntel', 0, false)).toBe(false)
    expect(usesTabletLayout('Windows', 'Win32', 10, false)).toBe(false)
    expect(usesTabletLayout('Android', 'Linux', 5, true)).toBe(true)
  })
})

describe('page turn recognition', () => {
  it('recognizes left and right horizontal swipes', () => {
    expect(horizontalPageTurn({ x: 200, y: 100 }, { x: 80, y: 110 }, 250, false)).toBe('next')
    expect(horizontalPageTurn({ x: 80, y: 110 }, { x: 200, y: 100 }, 250, false)).toBe('previous')
  })
  it('rejects taps, vertical scrolling, diagonal drags, slow gestures and pinches', () => {
    const start = { x: 200, y: 100 }
    expect(horizontalPageTurn(start, { x: 180, y: 100 }, 200, false)).toBeNull()
    expect(horizontalPageTurn(start, { x: 190, y: 250 }, 200, false)).toBeNull()
    expect(horizontalPageTurn(start, { x: 80, y: 210 }, 200, false)).toBeNull()
    expect(horizontalPageTurn(start, { x: 80, y: 100 }, 901, false)).toBeNull()
    expect(horizontalPageTurn(start, { x: 80, y: 100 }, 200, true)).toBeNull()
  })
})
