import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { NotePage } from '../model'
import { scrollPageLayouts, visibleScrollPages, type PenActivity } from '../page-layout'

interface Props {
  pages: NotePage[]
  viewport: RefObject<HTMLDivElement | null>
  zoom: number
  target: { id: string; serial: number }
  pen: RefObject<PenActivity>
  onActive: (id: string) => void
  renderPage: (page: NotePage, scale: number, scroll: (dx: number, dy: number) => void) => ReactNode
}

export function ScrollNotebook({ pages, viewport, zoom, target, pen, onActive, renderPage }: Props) {
  const [size, setSize] = useState({ width: 800, height: 800 })
  const [top, setTop] = useState(0)
  const [heldPage, setHeldPage] = useState<string | null>(null)
  const heldPointers = useRef(new Set<number>())
  const active = useRef(target.id)
  const lastScroll = useRef({ top: 0, left: 0 })
  const contentWidth = Math.max(33, size.width * zoom)
  const layouts = useMemo(() => scrollPageLayouts(pages, contentWidth), [pages, contentWidth])
  const visible = new Set(visibleScrollPages(layouts, top, size.height))
  if (heldPage) visible.add(heldPage)
  const layoutKey = layouts.map(page => `${page.id}:${page.height}`).join('|')
  const callbacks = useRef(onActive)
  callbacks.current = onActive
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const wheel = (event: WheelEvent) => { if (pen.current.id !== null) event.preventDefault() }
    const released = (event: PointerEvent) => {
      heldPointers.current.delete(event.pointerId)
      if (!heldPointers.current.size) setHeldPage(null)
    }
    const blurred = () => { heldPointers.current.clear(); setHeldPage(null) }
    element.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('pointerup', released, true)
    window.addEventListener('pointercancel', released, true)
    window.addEventListener('blur', blurred)
    return () => {
      observer.disconnect(); element.removeEventListener('wheel', wheel)
      window.removeEventListener('pointerup', released, true)
      window.removeEventListener('pointercancel', released, true)
      window.removeEventListener('blur', blurred)
    }
  }, [viewport, pen])
  useLayoutEffect(() => {
    const element = viewport.current
    const page = layouts.find(page => page.id === active.current)
    if (element && page && pen.current.id === null) { element.scrollTop = page.top; lastScroll.current = { top: element.scrollTop, left: element.scrollLeft }; setTop(element.scrollTop) }
  }, [layoutKey, viewport, pen])
  useLayoutEffect(() => {
    const element = viewport.current
    const page = layouts.find(page => page.id === target.id)
    if (element && page) {
      element.scrollTop = page.top
      lastScroll.current = { top: element.scrollTop, left: element.scrollLeft }
      setTop(element.scrollTop)
      active.current = page.id
      callbacks.current(page.id)
    }
  }, [target.id, target.serial, viewport])
  const scroll = (dx: number, dy: number) => {
    if (pen.current.id !== null || !viewport.current) return
    viewport.current.scrollTop += dy
    viewport.current.scrollLeft += dx
    lastScroll.current = { top: viewport.current.scrollTop, left: viewport.current.scrollLeft }
  }
  return <div className="scroll-notebook" ref={viewport} data-testid="scroll-notebook" aria-label="Continuously scrolling notebook" onScroll={event => {
    const element = event.currentTarget
    if (pen.current.id !== null) {
      element.scrollTop = lastScroll.current.top
      element.scrollLeft = lastScroll.current.left
      return
    }
    lastScroll.current = { top: element.scrollTop, left: element.scrollLeft }
    setTop(element.scrollTop)
    const position = element.scrollTop + Math.min(element.clientHeight * 0.3, 240)
    const page = layouts.find(page => position < page.top + page.height) ?? layouts.at(-1)
    if (page && page.id !== active.current) { active.current = page.id; callbacks.current(page.id) }
  }}>
    <div className="scroll-pages" style={{ width: Math.max(size.width, contentWidth), height: (layouts.at(-1)?.top ?? 0) + (layouts.at(-1)?.height ?? 0) + 16 }}>
      {layouts.map((layout, index) => <section key={layout.id} className="scroll-page-frame" style={{ top: layout.top, left: Math.max(0, (size.width - contentWidth) / 2), width: contentWidth, height: layout.height }} aria-label={`Notebook page ${index + 1}`} data-page-id={layout.id}
        onPointerDownCapture={event => {
          if (event.pointerType === 'touch' && pen.current.id !== null) return
          heldPointers.current.add(event.pointerId)
          setHeldPage(layout.id)
          active.current = layout.id
          callbacks.current(layout.id)
        }}>
        {visible.has(layout.id) ? renderPage(pages[index], layout.scale, scroll) : <div className="scroll-page-placeholder">Page {index + 1}</div>}
      </section>)}
    </div>
  </div>
}
