import { dotRadius, isDotStroke, pressureWidth, type NotePage, type Stroke } from './model'
import { penPath } from './ink'
const canvasPaths = new WeakMap<Stroke, Path2D>()

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return
  ctx.save()
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (isDotStroke(stroke)) {
    const point = stroke.points[0]
    ctx.globalAlpha *= stroke.tool === 'highlighter' ? 0.3 : 1
    ctx.beginPath()
    ctx.arc(point.x, point.y, dotRadius(stroke), 0, Math.PI * 2)
    ctx.fill()
  } else if (stroke.tool === 'highlighter') {
    ctx.globalAlpha *= 0.3
    ctx.lineWidth = stroke.width * 5
    ctx.beginPath()
    stroke.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.stroke()
  } else if (stroke.penStyle) {
    let path = canvasPaths.get(stroke)
    if (!path) { path = new Path2D(penPath(stroke)); canvasPaths.set(stroke, path) }
    ctx.fill(path)
  } else {
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1], b = stroke.points[i]
      ctx.lineWidth = pressureWidth(stroke.width, (a.pressure + b.pressure) / 2)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function paintPage(ctx: CanvasRenderingContext2D, page: NotePage, image?: CanvasImageSource, inlineImages: ReadonlyMap<string, CanvasImageSource> = new Map()) {
  ctx.clearRect(0, 0, page.width, page.height)
  ctx.fillStyle = '#fffefb'
  ctx.fillRect(0, 0, page.width, page.height)
  if (image) ctx.drawImage(image, 0, 0, page.width, page.height)
  else if (page.template === 'dotted') {
    ctx.fillStyle = '#d4d8d2'
    for (let x = 30; x < page.width; x += 24) {
      for (let y = 30; y < page.height; y += 24) {
        ctx.beginPath()
        ctx.arc(x, y, 0.8, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (page.template === 'ruled') {
    ctx.strokeStyle = '#dce1dc'
    ctx.lineWidth = 1
    for (let y = 65; y < page.height; y += 30) {
      ctx.beginPath()
      ctx.moveTo(30, y)
      ctx.lineTo(page.width - 30, y)
      ctx.stroke()
    }
  }
  for (const placed of page.images) {
    const image = inlineImages.get(placed.assetId)
    if (image) ctx.drawImage(image, placed.x, placed.y, placed.width, placed.height)
  }
  for (const stroke of page.strokes) drawStroke(ctx, stroke)
}

export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('A saved page image could not be decoded. Export a backup before making further changes.'))
    image.src = source
  })
}
