import { PDFDocument, LineCapStyle, degrees, rgb, type PDFPage, type PDFImage } from 'pdf-lib'
import { decodeBase64, jpegOrientation } from './assets'
import { dotRadius, isDotStroke, pressureWidth, type NotePage, type Notebook, type SourceAsset } from './model'
import { loadImage } from './render'

type Rect = { x: number; y: number; width: number; height: number; scale: number }

export function fitContent(width: number, height: number, box: { x: number; y: number; width: number; height: number }): Rect {
  const scale = Math.min(box.width / width, box.height / height)
  return { x: box.x + (box.width - width * scale) / 2, y: box.y + (box.height - height * scale) / 2, width: width * scale, height: height * scale, scale }
}

function color(hex: string) {
  return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)
}

function drawInk(output: PDFPage, page: NotePage, rect: Rect) {
  const position = (x: number, y: number) => ({ x: rect.x + x * rect.scale, y: rect.y + rect.height - y * rect.scale })
  for (const stroke of page.strokes) {
    const points = stroke.points
    if (isDotStroke(stroke)) {
      output.drawCircle({ ...position(points[0].x, points[0].y), size: dotRadius(stroke) * rect.scale, color: color(stroke.color), opacity: stroke.tool === 'highlighter' ? 0.3 : 1 })
    } else if (stroke.tool === 'highlighter') {
      const path = points.map((p, index) => `${index ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
      output.drawSvgPath(path, { x: rect.x, y: rect.y + rect.height, scale: rect.scale, borderColor: color(stroke.color), borderWidth: stroke.width * 5, borderOpacity: 0.3, borderLineCap: LineCapStyle.Round })
    } else {
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1], b = points[index]
        output.drawLine({ start: position(a.x, a.y), end: position(b.x, b.y), thickness: pressureWidth(stroke.width, (a.pressure + b.pressure) / 2) * rect.scale, color: color(stroke.color), lineCap: LineCapStyle.Round })
      }
    }
  }
}

function drawTemplate(output: PDFPage, page: NotePage, rect: Rect) {
  if (page.template === 'dotted') {
    for (let x = 30; x < page.width; x += 24) for (let y = 30; y < page.height; y += 24) {
      output.drawCircle({ x: rect.x + x * rect.scale, y: rect.y + rect.height - y * rect.scale, size: 0.8 * rect.scale, color: color('#d4d8d2') })
    }
  } else if (page.template === 'ruled') {
    for (let y = 65; y < page.height; y += 30) {
      output.drawLine({ start: { x: rect.x + 30 * rect.scale, y: rect.y + rect.height - y * rect.scale }, end: { x: rect.x + (page.width - 30) * rect.scale, y: rect.y + rect.height - y * rect.scale }, thickness: rect.scale, color: color('#dce1dc') })
    }
  }
}

async function embedImage(pdf: PDFDocument, asset: SourceAsset): Promise<PDFImage> {
  const bytes = decodeBase64(asset.data)
  if (asset.mime === 'image/png') return pdf.embedPng(bytes)
  if (asset.mime === 'image/jpeg' && jpegOrientation(bytes) === 1) return pdf.embedJpg(bytes)
  const image = await loadImage(`data:${asset.mime};base64,${asset.data}`)
  if (image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error('This image is too large for lossless orientation/WebP conversion. Export it as PNG before importing; the original has not been reduced.')
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Full-resolution image export could not allocate memory. Close other tabs and retry.')
    context.drawImage(image, 0, 0)
    return await pdf.embedPng(canvas.toDataURL('image/png'))
  } finally { canvas.width = 0; canvas.height = 0 }
}

export async function buildNotebookPdf(notebook: Notebook, progress: (message: string) => void = () => undefined): Promise<Uint8Array> {
  if (!notebook.pages.length) throw new Error('The notebook has no pages to export.')
  const pdf = await PDFDocument.create()
  pdf.setTitle(notebook.title)
  pdf.setCreator('OpenNotes')
  const width = notebook.pages[0].width * 0.75, height = notebook.pages[0].height * 0.75
  const documents = new Map<string, PDFDocument>()
  const images = new Map<string, PDFImage>()
  for (const [index, page] of notebook.pages.entries()) {
    progress(`Exporting PDF · page ${index + 1} of ${notebook.pages.length}`)
    const output = pdf.addPage([width, height])
    output.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) })
    const rect = fitContent(page.width, page.height, { x: 0, y: 0, width, height })
    if (page.source) {
      const asset = notebook.sources.find(value => value.id === page.source!.assetId)
      if (!asset) throw new Error('An original source file is missing. Restore an editable backup or re-import the original; no lower-quality export was substituted.')
      if (asset.kind === 'pdf') {
        let document = documents.get(asset.id)
        if (!document) { document = await PDFDocument.load(decodeBase64(asset.data)); documents.set(asset.id, document) }
        const original = document.getPages()[page.source.pageIndex]
        if (!original) throw new Error('The original PDF page could not be found.')
        const crop = original.getCropBox()
        const embedded = await pdf.embedPage(original, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height })
        const rotation = ((original.getRotation().angle % 360) + 360) % 360
        const rotated = rotation === 90 || rotation === 270
        const target = fitContent(rotated ? embedded.height : embedded.width, rotated ? embedded.width : embedded.height, rect)
        output.drawPage(embedded, {
          x: target.x + (rotation === 180 || rotation === 270 ? target.width : 0),
          y: target.y + (rotation === 90 || rotation === 180 ? target.height : 0),
          width: embedded.width * target.scale, height: embedded.height * target.scale, rotate: degrees(-rotation),
        })
      } else {
        let image = images.get(asset.id)
        if (!image) { image = await embedImage(pdf, asset); images.set(asset.id, image) }
        output.drawImage(image, fitContent(image.width, image.height, rect))
      }
    } else if (page.background) {
      const image = page.background.startsWith('data:image/png;') ? await pdf.embedPng(page.background) : await pdf.embedJpg(page.background)
      output.drawImage(image, { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    } else drawTemplate(output, page, rect)
    for (const placed of page.images) {
      const asset = notebook.sources.find(value => value.id === placed.assetId)
      if (!asset || asset.kind !== 'image') throw new Error('An inline image original is missing. Restore a backup before exporting.')
      let image = images.get(asset.id)
      if (!image) { image = await embedImage(pdf, asset); images.set(asset.id, image) }
      output.drawImage(image, { x: rect.x + placed.x * rect.scale, y: rect.y + rect.height - (placed.y + placed.height) * rect.scale, width: placed.width * rect.scale, height: placed.height * rect.scale })
    }
    drawInk(output, page, rect)
  }
  return pdf.save()
}
