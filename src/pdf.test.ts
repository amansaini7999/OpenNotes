import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, degrees } from 'pdf-lib'
import { buildNotebookPdf, fitContent } from './pdf'
import { createSourceAsset, decodeBase64, encodeBase64, jpegOrientation } from './assets'
import { backupSchema, createNotebook, createPage, emptyLibrary, mergeBackup } from './model'

const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='

describe('uniform, source-preserving PDF export', () => {
  it('uses the first notebook page dimensions for portrait and landscape attachments', async () => {
    const note = createNotebook('Aligned pages', undefined, 'plain')
    note.pages.push({ ...createPage('plain'), width: 1131, height: 1600 }, { ...createPage('plain'), width: 1200, height: 783 })
    const pdf = await PDFDocument.load(await buildNotebookPdf(note))
    for (const page of pdf.getPages()) expect(page.getSize()).toEqual({ width: 595.5, height: 842.25 })
  })
  it('fits content proportionally with margins rather than stretching or cropping', () => {
    const rect = fitContent(1200, 600, { x: 0, y: 0, width: 600, height: 800 })
    expect(rect).toEqual({ x: 0, y: 250, width: 600, height: 300, scale: 0.5 })
  })
  it('embeds PDF page content as a vector form, including rotated/cropped pages', async () => {
    const source = await PDFDocument.create()
    const original = source.addPage([600, 400])
    original.drawText('Original vector text', { x: 40, y: 200 })
    original.setCropBox(20, 20, 560, 360)
    original.setRotation(degrees(90))
    const asset = createSourceAsset(await source.save(), 'pdf')
    const note = createNotebook('Vector PDF', undefined, 'plain')
    note.sources = [asset]
    note.pages.push({ ...createPage('plain'), width: 360, height: 560, source: { assetId: asset.id, pageIndex: 0 } })
    const pdf = await PDFDocument.load(await buildNotebookPdf(note))
    let formText = '', imageCount = 0
    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue
      const subtype = object.dict.get(PDFName.of('Subtype'))?.toString()
      if (subtype === '/Image') imageCount++
      if (subtype === '/Form') formText += (object.dict.get(PDFName.of('Filter'))?.toString() === '/FlateDecode' ? inflateSync(object.getContents()) : Buffer.from(object.getContents())).toString()
    }
    expect(imageCount).toBe(0)
    expect(formText).toContain(Buffer.from('Original vector text').toString('hex').toUpperCase())
    expect(pdf.getPages().map(page => page.getSize())).toEqual([{ width: 595.5, height: 842.25 }, { width: 595.5, height: 842.25 }])
  })
  it('embeds original image pixels rather than rasterizing the entire page', async () => {
    const note = createNotebook('Original image', undefined, 'plain')
    const asset = createSourceAsset(decodeBase64(pixel), 'image')
    note.sources = [asset]
    note.pages[0].source = { assetId: asset.id, pageIndex: 0 }
    const pdf = await PDFDocument.load(await buildNotebookPdf(note))
    const imageSizes: number[][] = []
    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
        imageSizes.push([object.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber(), object.dict.lookup(PDFName.of('Height'), PDFNumber).asNumber()])
      }
    }
    expect(imageSizes.length).toBeGreaterThan(0)
    expect(imageSizes.every(size => size[0] === 1 && size[1] === 1)).toBe(true)
  })
  it('keeps legacy preview-only pages readable without inventing missing detail', async () => {
    const note = createNotebook('Legacy', undefined, 'plain')
    note.pages[0].background = `data:image/png;base64,${pixel}`
    expect((await PDFDocument.load(await buildNotebookPdf(note))).getPageCount()).toBe(1)
  })
  it('fails explicitly when a referenced original is missing', async () => {
    const note = createNotebook('Missing original')
    note.pages[0].source = { assetId: crypto.randomUUID(), pageIndex: 0 }
    await expect(buildNotebookPdf(note)).rejects.toThrow('no lower-quality export was substituted')
  })
})

describe('original source backup integrity', () => {
  it('round-trips source bytes and remaps source identifiers during backup merge', () => {
    const note = createNotebook('Originals')
    const asset = createSourceAsset(decodeBase64(pixel), 'image')
    note.sources = [asset]
    note.pages[0].source = { assetId: asset.id, pageIndex: 0 }
    const library = { ...emptyLibrary(), notebooks: [note] }
    expect(backupSchema.safeParse(library).success).toBe(true)
    const imported = mergeBackup(library, library)
    expect(imported.notebooks[1].sources[0].id).not.toBe(asset.id)
    expect(imported.notebooks[1].sources[0].data).toBe(asset.data)
    expect(imported.notebooks[1].pages[0].source!.assetId).toBe(imported.notebooks[1].sources[0].id)
    expect(backupSchema.safeParse(imported).success).toBe(true)
    expect(encodeBase64(decodeBase64(asset.data))).toBe(asset.data)
  })
  it('rejects dangling source references and invalid source page indexes', () => {
    const note = createNotebook('Bad reference')
    const asset = createSourceAsset(decodeBase64(pixel), 'image')
    note.sources = [asset]
    note.pages[0].source = { assetId: asset.id, pageIndex: 1 }
    expect(backupSchema.safeParse({ ...emptyLibrary(), notebooks: [note] }).success).toBe(false)
    note.pages[0].source = { assetId: crypto.randomUUID(), pageIndex: 0 }
    expect(backupSchema.safeParse({ ...emptyLibrary(), notebooks: [note] }).success).toBe(false)
  })
  it('recognizes EXIF orientations and safely handles truncated JPEG metadata', () => {
    const bytes = new Uint8Array(40)
    const view = new DataView(bytes.buffer)
    bytes.set([0xff, 0xd8, 0xff, 0xe1], 0)
    view.setUint16(4, 34)
    bytes.set([69, 120, 105, 102, 0, 0], 6)
    view.setUint16(12, 0x4949)
    view.setUint16(14, 42, true)
    view.setUint32(16, 8, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 0x0112, true)
    view.setUint16(24, 3, true)
    view.setUint32(26, 1, true)
    view.setUint16(30, 6, true)
    expect(jpegOrientation(bytes)).toBe(6)
    expect(jpegOrientation(bytes.subarray(0, 12))).toBe(1)
    expect(jpegOrientation(new Uint8Array())).toBe(1)
  })
})
