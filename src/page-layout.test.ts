import { describe, expect, it } from 'vitest'
import { createPage } from './model'
import { scrollPageLayouts, visibleScrollPages } from './page-layout'

describe('virtualized continuous notebook layout', () => {
  it('preserves page proportions and places pages in a continuous ordered column', () => {
    const pages = [createPage(), { ...createPage(), width: 1200, height: 600 }]
    const layouts = scrollPageLayouts(pages, 800)
    expect(layouts[0].top).toBe(0)
    expect(layouts[0].height).toBeCloseTo(1123 * 768 / 794 + 32)
    expect(layouts[1].top).toBe(layouts[0].height + 16)
    expect(layouts[1].height).toBe(600 * 768 / 1200 + 32)
  })
  it('bounds mounted pages near the viewport instead of creating hundreds of canvases', () => {
    const pages = Array.from({ length: 200 }, () => createPage())
    const layouts = scrollPageLayouts(pages, 800)
    const target = layouts[100]
    const visible = visibleScrollPages(layouts, target.top, 1000)
    expect(visible).toContain(target.id)
    expect(visible.length).toBeLessThanOrEqual(4)
    expect(visible).not.toContain(layouts[0].id)
    expect(visible).not.toContain(layouts[199].id)
  })
})
