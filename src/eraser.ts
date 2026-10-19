import { distanceToSegment, strokeRadiusAt, type Point, type Stroke } from './model'

type Interval = [number, number]
const EPSILON = 1e-8
const interpolate = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  pressure: a.pressure + (b.pressure - a.pressure) * t,
})

function circleInterval(a: Point, b: Point, center: Point, radius: number): Interval[] {
  const dx = b.x - a.x, dy = b.y - a.y
  const x = a.x - center.x, y = a.y - center.y
  const length = dx * dx + dy * dy
  if (length < EPSILON) return x * x + y * y <= radius * radius ? [[0, 1]] : []
  const projection = x * dx + y * dy
  const discriminant = projection * projection - length * (x * x + y * y - radius * radius)
  if (discriminant < 0) return []
  const root = Math.sqrt(discriminant)
  const start = Math.max(0, (-projection - root) / length)
  const end = Math.min(1, (-projection + root) / length)
  return end > start + EPSILON ? [[start, end]] : []
}

function capsuleIntervals(a: Point, b: Point, c: Point, d: Point, radius: number): Interval[] {
  const intervals = [...circleInterval(a, b, c, radius), ...circleInterval(a, b, d, radius)]
  const length = Math.hypot(d.x - c.x, d.y - c.y)
  if (length < EPSILON) return intervals
  const ux = (d.x - c.x) / length, uy = (d.y - c.y) / length
  let start = 0, end = 1
  // A swept circular tip is the union of an oriented rectangle and its endpoint circles.
  for (const [origin, delta, low, high] of [
    [(a.x - c.x) * ux + (a.y - c.y) * uy, (b.x - a.x) * ux + (b.y - a.y) * uy, 0, length],
    [-(a.x - c.x) * uy + (a.y - c.y) * ux, -(b.x - a.x) * uy + (b.y - a.y) * ux, -radius, radius],
  ]) {
    if (Math.abs(delta) < EPSILON) {
      if (origin < low || origin > high) return intervals
    } else {
      const first = (low - origin) / delta, last = (high - origin) / delta
      start = Math.max(start, Math.min(first, last))
      end = Math.min(end, Math.max(first, last))
      if (end <= start + EPSILON) return intervals
    }
  }
  intervals.push([start, end])
  return intervals
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const result: Interval[] = []
  for (const interval of intervals.sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1)
    if (last && interval[0] <= last[1] + EPSILON) last[1] = Math.max(last[1], interval[1])
    else result.push([...interval])
  }
  return result
}

export function eraseStrokePoints(stroke: Stroke, trail: Point[], radius: number): Point[][] | null {
  if (!trail.length) return null
  const halfWidth = (a: Point, b: Point) => Math.max(strokeRadiusAt(stroke, a.pressure), strokeRadiusAt(stroke, b.pressure))
  if (stroke.points.length === 1) {
    const point = stroke.points[0]
    const hit = trail.some((c, index) => distanceToSegment(point, c, trail[Math.min(index + 1, trail.length - 1)]) <= radius + halfWidth(point, point))
    return hit ? [] : null
  }
  const fragments: Point[][] = []
  let current: Point[] = []
  let changed = false
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1], b = stroke.points[i]
    const threshold = radius + halfWidth(a, b)
    const cuts: Interval[] = []
    for (let j = 0; j < trail.length; j++) {
      const c = trail[j], d = trail[Math.min(j + 1, trail.length - 1)]
      if (Math.max(a.x, b.x) < Math.min(c.x, d.x) - threshold || Math.min(a.x, b.x) > Math.max(c.x, d.x) + threshold ||
          Math.max(a.y, b.y) < Math.min(c.y, d.y) - threshold || Math.min(a.y, b.y) > Math.max(c.y, d.y) + threshold) continue
      cuts.push(...capsuleIntervals(a, b, c, d, threshold))
    }
    const merged = mergeIntervals(cuts)
    changed ||= merged.length > 0
    let cursor = 0
    for (const [start, end] of merged) {
      if (start > cursor + EPSILON) {
        if (!current.length) current.push(interpolate(a, b, cursor))
        current.push(interpolate(a, b, start))
      }
      if (current.length) fragments.push(current)
      current = []
      cursor = end
    }
    if (cursor < 1 - EPSILON) {
      if (!current.length) current.push(interpolate(a, b, cursor))
      current.push(b)
    }
  }
  if (current.length) fragments.push(current)
  return changed ? fragments : null
}

export function eraseInk(strokes: Stroke[], trail: Point[], radius: number): Stroke[] {
  let changed = false
  const next = strokes.flatMap(stroke => {
    const fragments = eraseStrokePoints(stroke, trail, radius)
    if (fragments === null) return [stroke]
    changed = true
    return fragments.map((points, index) => ({ ...stroke, id: index === 0 ? stroke.id : crypto.randomUUID(), points }))
  })
  return changed ? next : strokes
}
