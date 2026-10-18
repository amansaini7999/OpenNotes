export const PEN_TOUCH_GUARD_MS = 700

export function prefersPencilOnly(userAgent: string, platform: string, touchPoints: number): boolean {
  if (/iPhone|iPod/.test(userAgent)) return false
  return /iPad/.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1)
}

export function suppressTouch(penActive: boolean, lastPenAt: number, now: number): boolean {
  return penActive || now - lastPenAt < PEN_TOUCH_GUARD_MS
}
