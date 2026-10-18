import { describe, expect, it } from 'vitest'
import { moveImage, placeImage, resizeImage } from './images'
import { backupSchema, createNotebook, createPage, emptyLibrary, mergeBackup } from './model'
import { createSourceAsset, decodeBase64 } from './assets'
import { notebookHash } from './backup'

const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='

describe('inline image geometry and persistence', () => {
  it('places images proportionally inside the current page', () => {
    const page = createPage()
    const image = placeImage(page, crypto.randomUUID(), 800, 400)
    expect(image.width / image.height).toBe(2)
    expect(image.x).toBeGreaterThanOrEqual(0)
    expect(image.x + image.width).toBeLessThanOrEqual(page.width)
    expect(image.y + image.height).toBeLessThanOrEqual(page.height)
  })
  it('constrains movement and resizing to the page without mutating the source', () => {
    const page = createPage()
    const image = placeImage(page, crypto.randomUUID(), 800, 400)
    const moved = moveImage(image, -100, 90000, page)
    expect(moved.x).toBe(0)
    expect(moved.y + moved.height).toBe(page.height)
    const resized = resizeImage(image, 90000, page)
    expect(resized.width / resized.height).toBeCloseTo(2)
    expect(resized.x + resized.width).toBeLessThanOrEqual(page.width)
    expect(resized.y + resized.height).toBeLessThanOrEqual(page.height)
    expect(image.width).not.toBe(resized.width)
  })
  it('rejects unplaceable dimensions rather than distorting them', () => {
    expect(() => placeImage(createPage(), crypto.randomUUID(), 0, 100)).toThrow('place safely')
    expect(() => placeImage(createPage(), crypto.randomUUID(), 1, 100000)).toThrow('place safely')
  })
  it('backs up inline images with remapped ids and equivalent content hashes', async () => {
    const note = createNotebook('Screenshot')
    const asset = createSourceAsset(decodeBase64(pixel), 'image')
    note.sources = [asset]
    note.pages[0].images = [placeImage(note.pages[0], asset.id, 800, 400)]
    const library = { ...emptyLibrary(), notebooks: [note] }
    expect(backupSchema.safeParse(library).success).toBe(true)
    const copy = mergeBackup(emptyLibrary(), library).notebooks[0]
    expect(copy.pages[0].images[0].id).not.toBe(note.pages[0].images[0].id)
    expect(copy.pages[0].images[0].assetId).toBe(copy.sources[0].id)
    expect(await notebookHash(copy)).toBe(await notebookHash(note))
    copy.pages[0].images[0].x += 5
    expect(await notebookHash(copy)).not.toBe(await notebookHash(note))
  })
})
