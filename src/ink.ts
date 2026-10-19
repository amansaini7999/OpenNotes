import { getStroke } from 'perfect-freehand'
import { pressureWidth, type Stroke } from './model'

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
  const path = stroke.penStyle === 'ballpoint' ? ballpointPath(stroke) :
    stroke.penStyle === 'pressure' ? outlinePath(penOutline(stroke)) : legacyPath(stroke)
  paths.set(stroke, path)
  return path
}

function ballpointPath(stroke: Stroke): string {
  const points = stroke.points.filter((point, index, values) => !index || point.x !== values[index - 1].x || point.y !== values[index - 1].y)
  if (!points.length) return ''
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1], current = points[index]
    path += ` Q ${previous.x} ${previous.y} ${(previous.x + current.x) / 2} ${(previous.y + current.y) / 2}`
  }
  const last = points.at(-1)!
  return `${path} L ${last.x} ${last.y}`
}

// Fill the union of legacy round-capped segments once, avoiding antialiased seams.
function legacyPath(stroke: Stroke): string {
  let path = ''
  for (let index = 1; index < stroke.points.length; index++) {
    const a = stroke.points[index - 1], b = stroke.points[index]
    const radius = pressureWidth(stroke.width, (a.pressure + b.pressure) / 2) / 2
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const x = Math.sin(angle) * radius, y = -Math.cos(angle) * radius
    path += `M ${a.x + x} ${a.y + y} L ${b.x + x} ${b.y + y} A ${radius} ${radius} 0 0 1 ${b.x - x} ${b.y - y} L ${a.x - x} ${a.y - y} A ${radius} ${radius} 0 0 1 ${a.x + x} ${a.y + y} Z `
  }
  return path.trim()
}
