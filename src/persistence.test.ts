import { describe, expect, it, vi } from 'vitest'
import { checkPersistence } from './persistence'

describe('honest browser storage persistence', () => {
  it('requests protection when notebook data exists and reports a real grant', async () => {
    const persist = vi.fn(async () => true)
    expect(await checkPersistence({ persisted: async () => false, persist }, true)).toBe('protected')
    expect(persist).toHaveBeenCalledOnce()
  })
  it('does not request protection before meaningful use or when it is already protected', async () => {
    const persist = vi.fn(async () => true)
    expect(await checkPersistence({ persisted: async () => false, persist }, false)).toBe('best-effort')
    expect(await checkPersistence({ persisted: async () => true, persist }, true)).toBe('protected')
    expect(persist).not.toHaveBeenCalled()
  })
  it('reports denial or missing APIs without claiming protection', async () => {
    expect(await checkPersistence({ persisted: async () => false, persist: async () => false }, true)).toBe('best-effort')
    expect(await checkPersistence(undefined, true)).toBe('unsupported')
  })
  it('propagates API errors so the UI can surface them', async () => {
    await expect(checkPersistence({ persisted: async () => { throw new Error('Storage unavailable') } }, true)).rejects.toThrow('Storage unavailable')
  })
})
