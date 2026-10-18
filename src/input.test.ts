import { describe, expect, it } from 'vitest'
import { PEN_TOUCH_GUARD_MS, prefersPencilOnly, suppressTouch } from './input'

describe('pen-first touch policy', () => {
  it('allows finger drawing on iPhone and iPod instead of treating them as Pencil-only iPads', () => {
    expect(prefersPencilOnly('Mozilla/5.0 (iPhone)', 'iPhone', 5)).toBe(false)
    expect(prefersPencilOnly('Mozilla/5.0 (iPhone)', 'MacIntel', 5)).toBe(false)
    expect(prefersPencilOnly('Mozilla/5.0 (iPod)', 'iPod', 5)).toBe(false)
  })
  it('defaults iPads, including desktop-identifying iPads, to Pencil-only input', () => {
    expect(prefersPencilOnly('Mozilla/5.0 (iPad)', 'iPad', 5)).toBe(true)
    expect(prefersPencilOnly('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBe(true)
    expect(prefersPencilOnly('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBe(false)
    expect(prefersPencilOnly('Windows', 'Win32', 0)).toBe(false)
  })
  it('blocks touch during pen contact and the post-pen guard window', () => {
    expect(suppressTouch(true, -Infinity, 1000)).toBe(true)
    expect(suppressTouch(false, 1000, 1000 + PEN_TOUCH_GUARD_MS - 1)).toBe(true)
    expect(suppressTouch(false, 1000, 1000 + PEN_TOUCH_GUARD_MS)).toBe(false)
    expect(suppressTouch(false, -Infinity, 0)).toBe(false)
  })
})
