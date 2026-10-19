import { expect, test, type Page } from '@playwright/test'
import { PDFDocument, rgb } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

async function book(pages: number) {
  const pdf = await PDFDocument.create()
  for (let index = 0; index < pages; index++) {
    const page = pdf.addPage([400, 600])
    page.drawRectangle({ x: 0, y: 0, width: 400, height: 600, color: index === pages - 1 ? rgb(0.1, 0.3, 0.8) : rgb(0.8, 0.2, 0.1) })
    page.drawText(`Book page ${index + 1}`, { x: 30, y: 550, size: 20, color: rgb(1, 1, 1) })
  }
  return Buffer.from(await pdf.save())
}

async function centerColor(page: Page) {
  return page.getByTestId('ink-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data).slice(0, 3))
}

test('a 1,000-page book imports with bounded rasterization, last-page annotation, offline reload and backup restore', async ({ page, context }) => {
  test.setTimeout(180_000)
  const data = await book(1000)
  await page.goto('./')
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device', { timeout: 60_000 })
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
    const original = HTMLCanvasElement.prototype.toDataURL
    Object.defineProperty(window, 'bookRasterCount', { value: 0, writable: true })
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      Reflect.set(window, 'bookRasterCount', Number(Reflect.get(window, 'bookRasterCount')) + 1)
      return original.apply(this, args)
    }
  })
  await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({ name: 'Book.pdf', mimeType: 'application/pdf', buffer: data })
  await expect(page.getByTestId('notebook-title')).toHaveText('Book', { timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Show page overview' })).toHaveText('Page 1 of 1000')
  await expect(page.getByTestId('pdf-page-loading')).toHaveCount(0, { timeout: 30_000 })
  await expect.poll(async () => { const [r, g, b] = await centerColor(page); return r > 180 && g < 90 && b < 90 }).toBe(true)
  expect(await page.evaluate(() => Number(Reflect.get(window, 'bookRasterCount')))).toBeLessThan(20)
  if (!await page.getByRole('button', { name: 'Page 1000', exact: true }).count()) await page.getByRole('button', { name: 'Show pages', exact: true }).click()
  await page.getByRole('button', { name: 'Page 1000', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show page overview' })).toHaveText('Page 1000 of 1000')
  await expect(page.getByTestId('pdf-page-loading')).toHaveCount(0, { timeout: 30_000 })
  await expect.poll(async () => { const [r, g, b] = await centerColor(page); return r < 90 && g < 120 && b > 180 }).toBe(true)
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Book page missing')
  await page.mouse.move(paper.x + paper.width * 0.3, paper.y + paper.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.6, paper.y + paper.height * 0.25, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device', { timeout: 60_000 })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('notebook-title')).toHaveText('Book', { timeout: 30_000 })
  if (!await page.getByRole('button', { name: 'Page 1000', exact: true }).count()) await page.getByRole('button', { name: 'Show pages', exact: true }).click()
  await page.getByRole('button', { name: 'Page 1000', exact: true }).click()
  await expect(page.getByTestId('pdf-page-loading')).toHaveCount(0, { timeout: 30_000 })
  await expect.poll(async () => { const [r, g, b] = await centerColor(page); return r < 90 && g < 120 && b > 180 }).toBe(true)
  const pdfDownload = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  const exportedPath = await (await pdfDownload).path()
  if (!exportedPath) throw new Error('Exported book missing')
  expect((await PDFDocument.load(await readFile(exportedPath))).getPageCount()).toBe(1000)
  await page.getByRole('button', { name: 'Back to notebooks', exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Back up everything', exact: true }).click()
  const path = await (await downloaded).path()
  if (!path) throw new Error('Book backup missing')
  const backup = await readFile(path)
  const saved = JSON.parse(backup.toString())
  expect(saved.notebooks[0].pages).toHaveLength(1000)
  expect(saved.notebooks[0].pages.filter((page: { background?: string }) => page.background)).toHaveLength(0)
  expect(saved.notebooks[0].pages[999].strokes).toHaveLength(1)
  expect(saved.notebooks[0].sources).toHaveLength(1)
  expect(saved.notebooks[0].sources[0].pageCount).toBe(1000)
  expect(backup.length).toBeLessThan(data.length * 2 + 500_000)
  await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({ name: 'book.opennotes', mimeType: 'application/json', buffer: backup })
  await page.getByRole('button', { name: 'Restore notebooks', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Restore complete:' })).toContainText('1 unchanged')
  await expect(page.getByRole('button', { name: 'Open Book', exact: true })).toHaveCount(1)
})

test('inserting a 1,000-page book preserves the existing notebook and rejects larger PDFs atomically', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('./')
  await page.getByRole('button', { name: 'Create a notebook', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notebook name' }).fill('Book notes')
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click()
  await page.getByLabel('Insert PDF or images as pages').setInputFiles({ name: 'book.pdf', mimeType: 'application/pdf', buffer: await book(1000) })
  await expect(page.getByRole('button', { name: 'Show page overview' })).toHaveText('Page 2 of 1001', { timeout: 60_000 })
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device', { timeout: 60_000 })
  await expect(page.getByTestId('pdf-page-loading')).toHaveCount(0, { timeout: 30_000 })
  await page.getByLabel('Insert PDF or images as pages').setInputFiles({ name: 'too-long.pdf', mimeType: 'application/pdf', buffer: await book(1001) })
  await expect(page.getByRole('alert')).toContainText('up to 1,000 pages')
  await expect(page.getByRole('button', { name: 'Show page overview' })).toHaveText('Page 2 of 1001')
})
