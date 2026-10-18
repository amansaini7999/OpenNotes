import { useEffect, useRef, useState } from 'react'
import { checkPersistence, type PersistenceStatus } from '../persistence'

export function usePersistence(hasNotebooks: boolean) {
  const [status, setStatus] = useState<PersistenceStatus>('checking')
  const [error, setError] = useState('')
  const generation = useRef(0)
  useEffect(() => {
    let mounted = true
    const inspect = async () => {
      const current = ++generation.current
      try {
        const result = await checkPersistence(navigator.storage, hasNotebooks)
        if (mounted && generation.current === current) { setStatus(result); setError('') }
      } catch (cause: unknown) {
        if (mounted && generation.current === current) {
          setStatus('error')
          setError(`Browser storage protection could not be checked: ${cause instanceof Error ? cause.message : String(cause)}. Keep exported backups.`)
        }
      }
    }
    void inspect()
    window.addEventListener('appinstalled', inspect)
    return () => { mounted = false; window.removeEventListener('appinstalled', inspect) }
  }, [hasNotebooks])
  return { status, error }
}
