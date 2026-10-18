export type PageTurn = 'next' | 'previous'
export type Position = { x: number; y: number }

export function usesTabletLayout(userAgent: string, platform: string, touchPoints: number, coarsePointer: boolean): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && touchPoints > 1) ||
    (coarsePointer && touchPoints > 0)
}

export function horizontalPageTurn(start: Position, end: Position, durationMs: number, pinched: boolean): PageTurn | null {
  const dx = end.x - start.x, dy = end.y - start.y
  if (pinched || durationMs > 900 || Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.8) return null
  return dx < 0 ? 'next' : 'previous'
}
