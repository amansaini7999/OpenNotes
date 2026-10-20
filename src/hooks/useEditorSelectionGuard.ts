import { useEffect, type RefObject } from 'react'
import { PEN_TOUCH_GUARD_MS } from '../input'

export function useEditorSelectionGuard(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current
    if (!element) return
    document.documentElement.classList.add('writing-session')
    let penId: number | null = null
    let blockedClickAt = -Infinity
    let lastControlPointer: { type: string; at: number } | null = null
    const blockedContacts = new Set<number>()
    const blockedTouches = new Set<number>()
    const targetInEditor = (event: Event) => {
      const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
      return target
    }
    const writingSurface = (target: Element | null) => Boolean(target?.closest('[data-testid="ink-viewport"]'))
    const block = (event: Event) => { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation() }
    const editingText = (target: Element | null) => {
      const field = target?.closest('input:not([type="range"]):not([type="file"]), textarea, [contenteditable="true"]')
      return Boolean(field?.closest('dialog[open]') && penId === null)
    }
    const clearSelection = () => {
      if (!editingText(document.activeElement)) {
        const selection = window.getSelection()
        if (selection?.rangeCount) selection.removeAllRanges()
      }
    }
    const reject = (event: Event) => {
      const target = targetInEditor(event)
      if (!editingText(target) && event.cancelable) event.preventDefault()
    }
    const down = (event: PointerEvent) => {
      const target = targetInEditor(event)
      if (!target) return
      if (!writingSurface(target)) lastControlPointer = { type: event.pointerType, at: performance.now() }
      if (event.pointerType === 'pen') {
        clearSelection()
        penId = writingSurface(target) ? event.pointerId : null
        blockedClickAt = -Infinity
      } else if (event.pointerType === 'mouse') blockedClickAt = -Infinity
      else if (event.pointerType === 'touch' && !writingSurface(target)) {
        if (penId !== null) { blockedContacts.add(event.pointerId); block(event) }
        else blockedClickAt = -Infinity
      }
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'pen' && (penId === event.pointerId || ((event.buttons & 1) && writingSurface(targetInEditor(event))))) {
        if (event.buttons & 1) penId = event.pointerId
        else if (event.pressure === 0) penId = null
      }
      if (blockedContacts.has(event.pointerId) && event.pointerType === 'touch') block(event)
    }
    const end = (event: PointerEvent) => {
      if (event.pointerType === 'pen' && penId === event.pointerId) penId = null
      if (event.pointerType === 'touch' && blockedContacts.delete(event.pointerId)) { blockedClickAt = performance.now(); block(event) }
    }
    const click = (event: MouseEvent) => {
      const target = targetInEditor(event)
      if (!target || writingSurface(target)) return
      const pointerType = event instanceof PointerEvent ? event.pointerType : ''
      if (pointerType === 'mouse' || pointerType === 'pen' || (event.detail === 0 && pointerType !== 'touch')) return
      if (!pointerType && lastControlPointer && performance.now() - lastControlPointer.at < 1000 && ['mouse', 'pen'].includes(lastControlPointer.type)) return
      if (penId !== null || performance.now() - blockedClickAt < PEN_TOUCH_GUARD_MS) block(event)
    }
    const touch = (event: TouchEvent) => {
      const target = targetInEditor(event)
      if (writingSurface(target) && !target?.closest('[data-native-scroll="true"]') && event.cancelable) event.preventDefault()
      if (Array.from(event.changedTouches).every(touch => 'touchType' in touch && touch.touchType === 'stylus')) return
      if (!target || writingSurface(target)) return
      const changed = Array.from(event.changedTouches)
      if (event.type === 'touchstart' && penId !== null) {
        for (const contact of changed) blockedTouches.add(contact.identifier)
        block(event)
      } else if (changed.some(contact => blockedTouches.has(contact.identifier))) {
        if (event.type === 'touchend' || event.type === 'touchcancel') {
          for (const contact of changed) blockedTouches.delete(contact.identifier)
          blockedClickAt = performance.now()
        }
        block(event)
      } else if (event.type === 'touchstart' && penId === null) blockedClickAt = -Infinity
    }
    const blur = () => { penId = null; blockedContacts.clear(); blockedTouches.clear() }
    clearSelection()
    document.addEventListener('selectionchange', clearSelection)
    document.addEventListener('selectstart', reject, true)
    document.addEventListener('contextmenu', reject, true)
    document.addEventListener('dragstart', reject, true)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    window.addEventListener('click', click, true)
    window.addEventListener('touchstart', touch, { capture: true, passive: false })
    window.addEventListener('touchend', touch, { capture: true, passive: false })
    window.addEventListener('touchcancel', touch, { capture: true, passive: false })
    window.addEventListener('blur', blur)
    return () => {
      document.documentElement.classList.remove('writing-session')
      document.removeEventListener('selectionchange', clearSelection)
      document.removeEventListener('selectstart', reject, true)
      document.removeEventListener('contextmenu', reject, true)
      document.removeEventListener('dragstart', reject, true)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('touchstart', touch, true)
      window.removeEventListener('touchend', touch, true)
      window.removeEventListener('touchcancel', touch, true)
      window.removeEventListener('blur', blur)
    }
  }, [root])
}
