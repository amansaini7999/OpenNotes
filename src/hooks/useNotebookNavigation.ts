import { useCallback, useEffect, useState } from 'react'
import type { NotebookNavigation } from '../page-layout'

export function useNotebookNavigation(onError: (message: string) => void) {
  const [navigation, setNavigation] = useState<NotebookNavigation>('swipe')
  useEffect(() => {
    try {
      const value = localStorage.getItem('opennotes-page-navigation')
      if (value === 'swipe' || value === 'scroll') setNavigation(value)
      else if (value !== null) onError('Saved page-navigation preference is invalid. Choose a mode in Page settings to replace it.')
    } catch (cause: unknown) {
      onError(`Page-navigation preference could not be read: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }, [onError])
  const choose = useCallback((value: NotebookNavigation) => {
    setNavigation(value)
    try { localStorage.setItem('opennotes-page-navigation', value) }
    catch (cause: unknown) { onError(`The navigation mode changed for this session but could not be remembered: ${cause instanceof Error ? cause.message : String(cause)}`) }
  }, [onError])
  return { navigation, choose }
}
