import type { Stroke } from './model'

export type TemporaryStroke = { stroke: Stroke; expiresAt: number; pointTimes?: number[]; lifetime?: number }

export function temporaryOpacity(expiresAt: number, now: number): number {
  const progress = Math.max(0, Math.min(1, (expiresAt - now) / 1000))
  return progress * progress * (3 - 2 * progress)
}

export function temporaryFrame(entry: TemporaryStroke, now: number): Stroke | null {
  if (now >= entry.expiresAt) return null
  if (!entry.pointTimes || entry.lifetime === undefined) return entry.stroke
  const cutoff = now - entry.lifetime
  const index = entry.pointTimes.findIndex(time => time > cutoff)
  if (index < 0) return null
  if (index === 0) return entry.stroke
  const previous = entry.stroke.points[index - 1], next = entry.stroke.points[index]
  const duration = entry.pointTimes[index] - entry.pointTimes[index - 1]
  const ratio = duration > 0 ? (cutoff - entry.pointTimes[index - 1]) / duration : 1
  const start = { x: previous.x + (next.x - previous.x) * ratio, y: previous.y + (next.y - previous.y) * ratio, pressure: next.pressure }
  return { ...entry.stroke, points: [start, ...entry.stroke.points.slice(index)] }
}
