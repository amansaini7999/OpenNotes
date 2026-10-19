import { getStroke } from 'perfect-freehand'
import type { Stroke } from './model'

export function penOutline(stroke: Stroke): number[][] {
  return getStroke(stroke.points.map(point => [point.x, point.y, point.pressure]), {
    size: stroke.width,
    thinning: stroke.penStyle === 'pressure' ? 0.25 : 0,
    smoothing: 0.7,
    streamline: 0,
    simulatePressure: false,
    last: true,
    start: { cap: true },
    end: { cap: true },
  })
}

export function outlinePath(points: number[][]): string {
  if (!points.length) return ''
  const format = (value: number) => Number(value.toFixed(3))
  const first = points[0], last = points[points.length - 1]
  let path = `M ${format((last[0] + first[0]) / 2)} ${format((last[1] + first[1]) / 2)} Q`
  for (let index = 0; index < points.length; index++) {
    const current = points[index], next = points[(index + 1) % points.length]
    path += ` ${format(current[0])} ${format(current[1])} ${format((current[0] + next[0]) / 2)} ${format((current[1] + next[1]) / 2)}`
  }
  return `${path} Z`
}

const paths = new WeakMap<Stroke, string>()
export function penPath(stroke: Stroke): string {
  const cached = paths.get(stroke)
  if (cached) return cached
  const path = outlinePath(penOutline(stroke))
  paths.set(stroke, path)
  return path
}
