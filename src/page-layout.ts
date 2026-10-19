import type { NotePage } from './model'

export type NotebookNavigation = 'swipe' | 'scroll'
export type PenActivity = { id: number | null; lastAt: number }
export type PageLayout = { id: string; top: number; height: number; scale: number }

export function scrollPageLayouts(pages: NotePage[], width: number): PageLayout[] {
  let top = 0
  return pages.map(page => {
    const scale = Math.max(0.1, Math.min(4, (width - 32) / page.width))
    const layout = { id: page.id, top, height: page.height * scale + 32, scale }
    top += layout.height + 16
    return layout
  })
}

export function visibleScrollPages(layouts: PageLayout[], top: number, height: number): string[] {
  const overscan = height * 0.25
  return layouts.filter(page => page.top + page.height >= top - overscan && page.top <= top + height + overscan).map(page => page.id)
}
