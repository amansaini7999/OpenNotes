import type { SourceAsset } from './model'

export function isBase64(data: string): boolean {
  let end = data.length
  if (data[end - 1] === '=') end--
  if (data[end - 1] === '=') end--
  if (!end) return false
  for (let index = 0; index < end; index += 65536) {
    if (!/^[A-Za-z0-9+/]+$/.test(data.slice(index, Math.min(index + 65536, end)))) return false
  }
  return true
}

export function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let index = 0; index < bytes.length; index += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 32768)))
  }
  return btoa(chunks.join(''))
}

export function decodeBase64(data: string): Uint8Array {
  return Uint8Array.from(atob(data), character => character.charCodeAt(0))
}

export function imageMime(bytes: Uint8Array): SourceAsset['mime'] {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp'
  throw new Error('The image format is unsupported. Choose a valid PNG, JPEG or WebP file.')
}

export function createSourceAsset(bytes: Uint8Array, kind: SourceAsset['kind'], pageCount = 1): SourceAsset {
  return {
    id: crypto.randomUUID(),
    kind,
    mime: kind === 'pdf' ? 'application/pdf' : imageMime(bytes),
    data: encodeBase64(bytes),
    pageCount,
  }
}

export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let position = 2
  while (position + 4 <= bytes.length && bytes[position] === 0xff) {
    const marker = bytes[position + 1]
    if (marker === 0xda || marker === 0xd9) break
    const length = view.getUint16(position + 2)
    if (length < 2 || position + 2 + length > bytes.length) break
    if (marker === 0xe1 && length >= 16 && String.fromCharCode(...bytes.subarray(position + 4, position + 10)) === 'Exif\u0000\u0000') {
      const start = position + 10, end = position + 2 + length
      const little = view.getUint16(start) === 0x4949
      if (view.getUint16(start + 2, little) !== 42) return 1
      const directory = start + view.getUint32(start + 4, little)
      if (directory + 2 > end) return 1
      const count = view.getUint16(directory, little)
      for (let index = 0; index < count; index++) {
        const entry = directory + 2 + index * 12
        if (entry + 12 > end) break
        if (view.getUint16(entry, little) === 0x0112) {
          const orientation = view.getUint16(entry + 8, little)
          return orientation >= 1 && orientation <= 8 ? orientation : 1
        }
      }
    }
    position += 2 + length
  }
  return 1
}
