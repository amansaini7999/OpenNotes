import { useEffect, useRef } from 'react'
import { drawStroke } from '../render'
import { temporaryOpacity, type TemporaryStroke } from '../temporary'

interface Props {
  width: number
  height: number
  strokes: TemporaryStroke[]
  onExpire: (ids: string[]) => void
}

export function TemporaryInk({ width, height, strokes, onExpire }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const expired = useRef(onExpire)
  expired.current = onExpire
  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    const ratio = Math.min(devicePixelRatio || 1, 2)
    element.width = Math.ceil(width * ratio)
    element.height = Math.ceil(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    let frame = 0
    const paint = () => {
      context.clearRect(0, 0, width, height)
      const now = performance.now()
      const removed: string[] = []
      for (const entry of strokes) {
        const opacity = temporaryOpacity(entry.expiresAt, now)
        if (!opacity) { removed.push(entry.stroke.id); continue }
        context.save()
        context.globalAlpha = opacity
        drawStroke(context, entry.stroke)
        context.restore()
      }
      if (removed.length) expired.current(removed)
      if (strokes.length) frame = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(frame)
  }, [width, height, strokes])
  return <canvas ref={canvas} data-testid="temporary-ink" aria-hidden="true" />
}
