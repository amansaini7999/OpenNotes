import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { drawStroke, loadImage, paintPage } from '../render'
import { type NotePage, type Point, type Stroke, type Tool } from '../model'
import { eraseInk } from '../eraser'
import { suppressTouch } from '../input'

type View = { x: number; y: number; scale: number }
type Position = { x: number; y: number }
type Gesture = { distance: number; midpoint: Position; view: View }
interface Props {
  page: NotePage
  tool: Tool
  color: string
  width: number
  eraserRadius: number
  penOnly: boolean
  fitMode: 'width' | 'page'
  fitToken: number
  zoomCommand: { factor: number; serial: number }
  onChange: (strokes: Stroke[]) => void
  onZoom: (percent: number) => void
  onError: (message: string) => void
  onPenDetected: () => void
}

export function InkCanvas({ page, tool, color, width, eraserRadius, penOnly, fitMode, fitToken, zoomCommand, onChange, onZoom, onError, onPenDetected }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const committed = useRef<HTMLCanvasElement>(null)
  const live = useRef<HTMLCanvasElement>(null)
  const [background, setBackground] = useState<{ source: string; image: HTMLImageElement } | null>(null)
  const strokesRef = useRef(page.strokes)
  const renderedPoints = useRef(0)
  const lastPenAt = useRef(-Infinity)
  const detectedPen = useRef(false)
  const eraserPosition = useRef<Point | null>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 })
  const [view, setView] = useState(viewRef.current)
  const active = useRef<{ id: number; type: string; stroke: Stroke; eraser: boolean } | null>(null)
  const touches = useRef(new Map<number, Position>())
  const gesture = useRef<Gesture | null>(null)
  const pan = useRef<{ id: number; type: string; start: Position; view: View } | null>(null)
  const frame = useRef(0)
  const onZoomRef = useRef(onZoom)
  onZoomRef.current = onZoom

  const moveView = (next: View) => {
    viewRef.current = next
    setView(next)
    onZoomRef.current(Math.round(next.scale * 100))
  }

  const clearLive = () => {
    const canvas = live.current
    const ctx = canvas?.getContext('2d')
    if (ctx && canvas) {
      ctx.save()
      ctx.resetTransform()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
    }
    renderedPoints.current = 0
  }

  const drawLive = () => {
    frame.current = 0
    const canvas = live.current, stroke = active.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const ratio = canvas.width / page.width
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    if (stroke && !stroke.eraser && stroke.stroke.tool === 'pen') {
      const points = stroke.stroke.points
      if (points.length > renderedPoints.current) {
        drawStroke(ctx, { ...stroke.stroke, points: points.slice(Math.max(0, renderedPoints.current - 1)) })
        renderedPoints.current = points.length
      }
      return
    }
    ctx.clearRect(0, 0, page.width, page.height)
    if (stroke && !stroke.eraser) drawStroke(ctx, stroke.stroke)
    if (stroke?.eraser && stroke.stroke.points.length) {
      paintCommitted(eraseInk(strokesRef.current, stroke.stroke.points, eraserRadius))
    }
    const point = stroke?.eraser ? stroke.stroke.points.at(-1) : tool === 'eraser' ? eraserPosition.current : null
    if (point) {
      ctx.strokeStyle = '#ba6066'
      ctx.lineWidth = 1.5
      ctx.fillStyle = '#ffffff80'
      ctx.beginPath()
      ctx.arc(point.x, point.y, eraserRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const fit = () => {
      if (active.current) return
      const widthScale = (element.clientWidth - 32) / page.width
      const scale = Math.max(0.1, Math.min(widthScale, fitMode === 'page' ? (element.clientHeight - 64) / page.height : 4))
      const next = { scale, x: (element.clientWidth - page.width * scale) / 2, y: fitMode === 'page' ? Math.max(16, (element.clientHeight - page.height * scale) / 2 - 16) : 16 }
      viewRef.current = next
      setView(next)
      onZoomRef.current(Math.round(scale * 100))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [page.id, page.width, page.height, fitMode, fitToken])

  useEffect(() => {
    const element = viewport.current
    if (!element || zoomCommand.serial === 0) return
    const previous = viewRef.current
    const scale = Math.max(0.1, Math.min(4, previous.scale * zoomCommand.factor))
    const center = { x: element.clientWidth / 2, y: element.clientHeight / 2 }
    const next = {
      scale,
      x: center.x - (center.x - previous.x) * scale / previous.scale,
      y: center.y - (center.y - previous.y) * scale / previous.scale,
    }
    viewRef.current = next
    setView(next)
    onZoomRef.current(Math.round(scale * 100))
  }, [zoomCommand])

  useEffect(() => {
    let cancelled = false
    if (page.background) {
      const source = page.background
      void loadImage(source).then(image => {
        if (!cancelled) setBackground({ source, image })
      }).catch((cause: unknown) => {
        if (!cancelled) onError(cause instanceof Error ? cause.message : 'Page image could not be loaded.')
      })
    } else setBackground(null)
    return () => { cancelled = true }
  }, [page.background, onError])

  useLayoutEffect(() => {
    strokesRef.current = page.strokes
    if (!committed.current || !live.current) return
    const ratio = Math.min(devicePixelRatio || 1, 2)
    for (const canvas of [committed.current, live.current]) {
      const width = Math.ceil(page.width * ratio), height = Math.ceil(page.height * ratio)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        if (canvas === live.current) renderedPoints.current = 0
      }
    }
    const ctx = committed.current.getContext('2d')
    if (!ctx) { onError('Canvas rendering is unavailable in this browser.'); return }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    paintPage(ctx, page, background?.source === page.background ? background?.image : undefined)
  }, [page, background, onError])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  useLayoutEffect(() => {
    if (!active.current) {
      eraserPosition.current = null
      clearLive()
    }
  }, [tool])

  function paintCommitted(strokes: Stroke[]) {
    const ctx = committed.current?.getContext('2d')
    if (ctx) paintPage(ctx, { ...page, strokes }, background?.source === page.background ? background?.image : undefined)
  }

  const localPosition = (event: { clientX: number; clientY: number }): Position => {
    const rect = viewport.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const pointFrom = (event: PointerEvent): Point => {
    const position = localPosition(event)
    const current = viewRef.current
    return {
      x: Math.max(0, Math.min(page.width, (position.x - current.x) / current.scale)),
      y: Math.max(0, Math.min(page.height, (position.y - current.y) / current.scale)),
      pressure: event.pointerType === 'pen' ? Math.max(0.05, event.pressure) : 0.5,
    }
  }

  const dismissTouches = () => {
    touches.current.clear()
    gesture.current = null
    if (pan.current?.type === 'touch') pan.current = null
    if (active.current?.type === 'touch') { active.current = null; clearLive() }
  }

  const startGesture = () => {
    const [a, b] = [...touches.current.values()]
    gesture.current = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      view: { ...viewRef.current },
    }
    if (active.current?.type === 'touch') { active.current = null; clearLive() }
    pan.current = null
  }

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (active.current?.type === 'pen' && event.pointerType !== 'pen')) return
    if (event.pointerType === 'touch' && suppressTouch(active.current?.type === 'pen', lastPenAt.current, performance.now())) return
    if (event.cancelable) event.preventDefault()
    if (event.pointerType === 'pen') {
      lastPenAt.current = performance.now()
      if (!detectedPen.current) { detectedPen.current = true; onPenDetected() }
      dismissTouches()
      pan.current = null
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, localPosition(event))
      if (touches.current.size >= 2) { startGesture(); return }
    }
    if (active.current) return
    if (event.pointerType === 'touch' && penOnly && tool !== 'hand') return
    if (tool === 'hand') {
      pan.current = { id: event.pointerId, type: event.pointerType, start: localPosition(event), view: { ...viewRef.current } }
      return
    }
    const raw = localPosition(event)
    const v = viewRef.current
    if (raw.x < v.x || raw.y < v.y || raw.x > v.x + page.width * v.scale || raw.y > v.y + page.height * v.scale) return
    active.current = {
      id: event.pointerId,
      type: event.pointerType,
      eraser: tool === 'eraser',
      stroke: { id: crypto.randomUUID(), tool: tool === 'highlighter' ? 'highlighter' : 'pen', color, width, points: [pointFrom(event.nativeEvent)] },
    }
    clearLive()
    drawLive()
  }

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'pen') {
      lastPenAt.current = performance.now()
      dismissTouches()
    }
    if (event.pointerType === 'touch' && suppressTouch(active.current?.type === 'pen', lastPenAt.current, performance.now())) {
      dismissTouches()
      return
    }
    if (active.current?.type === 'pen' && event.pointerType !== 'pen') return
    if (touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, localPosition(event))
      if (touches.current.size >= 2 && gesture.current) {
        const [a, b] = [...touches.current.values()], start = gesture.current
        const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const scale = Math.max(0.1, Math.min(4, start.view.scale * Math.hypot(a.x - b.x, a.y - b.y) / start.distance))
        moveView({
          scale,
          x: midpoint.x - (start.midpoint.x - start.view.x) * scale / start.view.scale,
          y: midpoint.y - (start.midpoint.y - start.view.y) * scale / start.view.scale,
        })
        return
      }
    }
    if (pan.current?.id === event.pointerId) {
      const position = localPosition(event), start = pan.current
      moveView({ ...start.view, x: start.view.x + position.x - start.start.x, y: start.view.y + position.y - start.start.y })
      return
    }
    if (active.current?.id !== event.pointerId) {
      if (!active.current && tool === 'eraser' && event.pointerType !== 'touch') {
        eraserPosition.current = pointFrom(event.nativeEvent)
        if (!frame.current) frame.current = requestAnimationFrame(drawLive)
      }
      return
    }
    if (event.cancelable) event.preventDefault()
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? []
    for (const sample of samples.length ? samples : [event.nativeEvent]) active.current.stroke.points.push(pointFrom(sample))
    if (!frame.current) frame.current = requestAnimationFrame(drawLive)
  }

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    touches.current.delete(event.pointerId)
    if (touches.current.size < 2) gesture.current = null
    if (pan.current?.id === event.pointerId) pan.current = null
    const stroke = active.current
    if (stroke?.id !== event.pointerId) return
    if (stroke.type === 'pen') lastPenAt.current = performance.now()
    cancelAnimationFrame(frame.current)
    frame.current = 0
    active.current = null
    clearLive()
    // Preserve sampled pen ink when Safari cancels input or capture is lost.
    // Cancellation coordinates are not reliable and must not create a spurious segment.
    if (cancelled && (stroke.type !== 'pen' || stroke.eraser)) {
      if (stroke.eraser) paintCommitted(strokesRef.current)
      return
    }
    if (!cancelled) {
      const point = pointFrom(event.nativeEvent)
      point.pressure = stroke.stroke.points.at(-1)!.pressure
      stroke.stroke.points.push(point)
    }
    const previous = strokesRef.current
    const next = stroke.eraser ? eraseInk(previous, stroke.stroke.points, eraserRadius) : [...previous, stroke.stroke]
    if (next !== previous) {
      strokesRef.current = next
      const ctx = committed.current?.getContext('2d')
      if (ctx && !stroke.eraser) drawStroke(ctx, stroke.stroke)
      onChange(next)
    }
  }

  return <div
    className={`ink-viewport tool-${tool}`}
    ref={viewport}
    data-testid="ink-viewport"
    aria-label="Writing surface. Use a pen or mouse to draw; two fingers to pan and zoom."
    onPointerEnter={event => {
      if (event.pointerType === 'pen') {
        lastPenAt.current = performance.now()
        dismissTouches()
      }
    }}
    onPointerDown={pointerDown}
    onPointerMove={pointerMove}
    onPointerLeave={() => {
      eraserPosition.current = null
      if (!active.current) clearLive()
    }}
    onPointerUp={event => finishPointer(event, false)}
    onPointerCancel={event => finishPointer(event, true)}
    onLostPointerCapture={event => finishPointer(event, true)}
    onContextMenu={event => event.preventDefault()}
    onWheel={event => {
      if (event.ctrlKey || event.metaKey) {
        const previous = viewRef.current, position = localPosition(event)
        const scale = Math.max(0.1, Math.min(4, previous.scale * Math.exp(-event.deltaY * 0.005)))
        moveView({ scale, x: position.x - (position.x - previous.x) * scale / previous.scale, y: position.y - (position.y - previous.y) * scale / previous.scale })
      } else {
        moveView({ ...viewRef.current, x: viewRef.current.x - event.deltaX, y: viewRef.current.y - event.deltaY })
      }
    }}
  >
    <div className="paper" data-testid="paper" style={{ width: page.width, height: page.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      <canvas ref={committed} data-testid="ink-canvas" aria-label="Notebook page" />
      <canvas ref={live} aria-hidden="true" />
    </div>
  </div>
}
