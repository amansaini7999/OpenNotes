export interface PersistenceAPI {
  persisted?: () => Promise<boolean>
  persist?: () => Promise<boolean>
}

export type PersistenceStatus = 'checking' | 'protected' | 'best-effort' | 'unsupported' | 'error'

export async function checkPersistence(storage: PersistenceAPI | undefined, request: boolean): Promise<Exclude<PersistenceStatus, 'checking' | 'error'>> {
  if (!storage?.persisted) return 'unsupported'
  if (await storage.persisted()) return 'protected'
  if (request && storage.persist && await storage.persist()) return 'protected'
  return 'best-effort'
}
