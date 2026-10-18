import type { NotePage, PlacedImage } from './model'

export function placeImage(page: NotePage, assetId: string, width: number, height: number): PlacedImage {
  const scale = Math.min(page.width * 0.45 / width, page.height * 0.4 / height)
  const imageWidth = width * scale, imageHeight = height * scale
  if (!Number.isFinite(scale) || width <= 0 || height <= 0 || imageWidth < 10 || imageHeight < 10) throw new Error('This image is too narrow or too tall to place safely. Crop it before inserting.')
  return { id: crypto.randomUUID(), assetId, x: (page.width - imageWidth) / 2, y: Math.min(page.height * 0.2, page.height - imageHeight), width: imageWidth, height: imageHeight }
}

export function moveImage(image: PlacedImage, x: number, y: number, page: NotePage): PlacedImage {
  return { ...image, x: Math.max(0, Math.min(page.width - image.width, x)), y: Math.max(0, Math.min(page.height - image.height, y)) }
}

export function resizeImage(image: PlacedImage, width: number, page: NotePage): PlacedImage {
  const ratio = image.height / image.width
  const maximum = Math.min(page.width - image.x, (page.height - image.y) / ratio)
  const minimum = Math.min(maximum, Math.max(10, 10 / ratio))
  const next = Math.max(minimum, Math.min(maximum, width))
  return { ...image, width: next, height: next * ratio }
}
