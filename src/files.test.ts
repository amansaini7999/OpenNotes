import { describe, expect, it } from 'vitest'
import { importPageFiles, importPdfPages } from './files'

describe('import size and capacity guards', () => {
  const progress = () => undefined
  it('rejects oversized PDFs before loading the decoder', async () => {
    const file = new File([new Uint8Array(30 * 1024 * 1024 + 1)], 'large.pdf')
    await expect(importPdfPages(file, progress)).rejects.toThrow('smaller than 30 MB')
  })
  it('rejects more than 50 files or insufficient notebook capacity', async () => {
    const files = Array.from({ length: 51 }, () => new File(['x'], 'image.png'))
    await expect(importPageFiles(files, 500, progress)).rejects.toThrow('up to 50 files')
    await expect(importPageFiles(files.slice(0, 2), 1, progress)).rejects.toThrow('Not enough page capacity')
    await expect(importPageFiles([], 500, progress)).rejects.toThrow('at least one')
  })
  it('rejects unsupported and oversized images with actionable errors', async () => {
    await expect(importPageFiles([new File(['x'], 'image.heic')], 500, progress)).rejects.toThrow('not supported')
    const image = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.png')
    await expect(importPageFiles([image], 500, progress)).rejects.toThrow('larger than 20 MB')
  })
})
