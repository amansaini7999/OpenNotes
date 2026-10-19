import { useEffect, type RefObject } from 'react'

export function useEditorSelectionGuard(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current
    if (!element) return
    const reject = (event: Event) => {
      const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
      const editable = target?.closest('input:not([type="range"]):not([type="file"]), textarea, [contenteditable="true"]')
      if (!editable && event.cancelable) event.preventDefault()
    }
    element.addEventListener('selectstart', reject, true)
    element.addEventListener('contextmenu', reject, true)
    return () => {
      element.removeEventListener('selectstart', reject, true)
      element.removeEventListener('contextmenu', reject, true)
    }
  }, [root])
}
