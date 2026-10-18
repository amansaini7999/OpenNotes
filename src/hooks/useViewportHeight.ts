import { useLayoutEffect } from 'react'

export function useViewportHeight() {
  useLayoutEffect(() => {
    const viewport = window.visualViewport
    const resize = () => {
      // Browser page zoom must not resize the document underneath the gesture.
      if (viewport && viewport.scale !== 1) return
      document.documentElement.style.setProperty('--app-height', `${viewport?.height ?? window.innerHeight}px`)
    }
    resize()
    viewport?.addEventListener('resize', resize)
    window.addEventListener('resize', resize)
    return () => {
      viewport?.removeEventListener('resize', resize)
      window.removeEventListener('resize', resize)
      document.documentElement.style.removeProperty('--app-height')
    }
  }, [])
}
