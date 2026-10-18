import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Maximize2, Minus, Plus, Trash2 } from 'lucide-react'
import { moveImage, resizeImage } from '../images'
import { suppressTouch } from '../input'
import type { NotePage, PlacedImage } from '../model'

interface Props {
  page: NotePage
  selectedId: string | null
  scale: number
  onSelect: (id: string | null) => void
  onChange: (images: PlacedImage[]) => void
  onPreview: (image: PlacedImage | null) => void
}

export function ImageSelection({ page, selectedId, scale, onSelect, onChange, onPreview }: Props) {
  const drag = useRef<{ pointerId: number; mode: 'move' | 'resize'; startX: number; startY: number; original: PlacedImage; next: PlacedImage } | null>(null)
  const lastPenAt = useRef(-Infinity)
  const [preview, setPreview] = useState<PlacedImage | null>(null)
  useEffect(() => () => onPreview(null), [onPreview])
  const replace = (image: PlacedImage) => onChange(page.images.map(value => value.id === image.id ? image : value))
  const start = (event: ReactPointerEvent<HTMLElement>, image: PlacedImage, mode: 'move' | 'resize') => {
    event.stopPropagation()
    if (event.button !== 0 || drag.current || (event.pointerType === 'touch' && suppressTouch(false, lastPenAt.current, performance.now()))) return
    if (event.pointerType === 'pen') lastPenAt.current = performance.now()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelect(image.id)
    drag.current = { pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, original: image, next: image }
  }
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = (event.clientX - current.startX) / scale, dy = (event.clientY - current.startY) / scale
    current.next = current.mode === 'move'
      ? moveImage(current.original, current.original.x + dx, current.original.y + dy, page)
      : resizeImage(current.original, current.original.width + dx, page)
    setPreview(current.next)
    onPreview(current.next)
    if (event.pointerType === 'pen') lastPenAt.current = performance.now()
  }
  const finish = (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    event.stopPropagation()
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    setPreview(null)
    onPreview(null)
    if (event.pointerType === 'pen') lastPenAt.current = performance.now()
    if (!cancelled && (current.next.x !== current.original.x || current.next.y !== current.original.y || current.next.width !== current.original.width || current.next.height !== current.original.height)) replace(current.next)
  }
  return <div className="image-selection-layer" aria-label="Inline images" style={{ '--image-ui-scale': 1 / scale } as CSSProperties}>
    {page.images.map((image, index) => {
      const box = preview?.id === image.id ? preview : image
      const selected = selectedId === image.id
      return <div key={image.id} className={`image-hit-area ${selected ? 'selected' : ''}`} style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
        role="group" tabIndex={0} aria-label={`Image ${index + 1}`}
        onFocus={() => onSelect(image.id)}
        onPointerDown={event => start(event, image, 'move')}
        onPointerMove={move}
        onPointerUp={event => finish(event, false)}
        onPointerCancel={event => finish(event, true)}
        onLostPointerCapture={event => finish(event, true)}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault(); onChange(page.images.filter(value => value.id !== image.id))
          } else if (event.key.startsWith('Arrow')) {
            event.preventDefault()
            replace(moveImage(image, image.x + (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0), image.y + (event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0), page))
          }
        }}>
        {selected && <>
          <div className="image-actions" onPointerDown={event => event.stopPropagation()}>
            <button aria-label="Shrink image" onClick={() => replace(resizeImage(image, image.width * 0.8, page))}><Minus size={16} /></button>
            <button aria-label="Enlarge image" onClick={() => replace(resizeImage(image, image.width * 1.25, page))}><Plus size={16} /></button>
            <button aria-label="Remove image" onClick={() => onChange(page.images.filter(value => value.id !== image.id))}><Trash2 size={16} /></button>
          </div>
          <button className="image-resize-handle" aria-label="Resize image" onPointerDown={event => start(event, image, 'resize')}
            onKeyDown={event => {
              if (event.key.startsWith('Arrow')) {
                event.preventDefault(); event.stopPropagation()
                replace(resizeImage(image, image.width + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 5), page))
              }
            }}><Maximize2 size={14} /></button>
        </>}
      </div>
    })}
  </div>
}
