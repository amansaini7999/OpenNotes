import type { Stroke } from './model'

export type TemporaryStroke = { stroke: Stroke; expiresAt: number }

export function temporaryOpacity(expiresAt: number, now: number): number {
  return Math.max(0, Math.min(1, (expiresAt - now) / 700))
}
