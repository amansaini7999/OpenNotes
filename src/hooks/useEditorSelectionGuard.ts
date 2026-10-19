import { useEffect, type RefObject } from 'react'
import { PEN_TOUCH_GUARD_MS, suppressTouch } from '../input'

export function useEditorSelectionGuard(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current
    if (!element) return
    document.documentElement.classList.add('writing-session')
    let penId: number | null = null
    let lastPenAt = -Infinity
    let blockedClickAt = -Infinity
    let lastControlPointer: { type: string; at: number } | null = null
    const blockedContacts = new Set<number>()
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
        if (writingSurface(target)) { penId = event.pointerId; lastPenAt = performance.now() }
        blockedClickAt = -Infinity
      } else if (event.pointerType === 'mouse') blockedClickAt = -Infinity
      else if (event.pointerType === 'touch' && !writingSurface(target)) {
        if (suppressTouch(penId !== null, lastPenAt, performance.now())) { blockedContacts.add(event.pointerId); block(event) }
        else if (!blockedContacts.size) blockedClickAt = -Infinity
      }
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'pen' && (penId === event.pointerId || writingSurface(targetInEditor(event)))) {
        lastPenAt = performance.now()
        if (event.buttons & 1) penId = event.pointerId
        else if (event.pressure === 0) penId = null
      }
      if (blockedContacts.has(event.pointerId) && event.pointerType === 'touch') block(event)
    }
    const end = (event: PointerEvent) => {
      if (event.pointerType === 'pen' && penId === event.pointerId) { penId = null; lastPenAt = performance.now() }
      if (event.pointerType === 'touch' && blockedContacts.delete(event.pointerId)) { blockedClickAt = performance.now(); block(event) }
    }
    const click = (event: MouseEvent) => {
      const target = targetInEditor(event)
      if (!target || writingSurface(target)) return
      const pointerType = event instanceof PointerEvent ? event.pointerType : ''
      if (pointerType === 'mouse' || pointerType === 'pen' || (event.detail === 0 && pointerType !== 'touch')) return
      if (!pointerType && lastControlPointer && performance.now() - lastControlPointer.at < 1000 && ['mouse', 'pen'].includes(lastControlPointer.type)) return
      if (suppressTouch(penId !== null, lastPenAt, performance.now()) || performance.now() - blockedClickAt < PEN_TOUCH_GUARD_MS) block(event)
    }
    const touch = (event: TouchEvent) => {
      const target = targetInEditor(event)
      if (writingSurface(target) && !target?.closest('[data-native-scroll="true"]') && event.cancelable) event.preventDefault()
      if (Array.from(event.changedTouches).every(touch => 'touchType' in touch && touch.touchType === 'stylus')) return
      if (penId === null && lastControlPointer?.type === 'pen' && performance.now() - lastControlPointer.at < 100) return
      if (target && !writingSurface(target) && (blockedContacts.size > 0 || suppressTouch(penId !== null, lastPenAt, performance.now()) || performance.now() - blockedClickAt < PEN_TOUCH_GUARD_MS)) block(event)
    }
    const blur = () => { if (penId !== null) { penId = null; lastPenAt = performance.now() } }
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
      window.removeEventListener('blur', blur)
    }
  }, [root])
}
