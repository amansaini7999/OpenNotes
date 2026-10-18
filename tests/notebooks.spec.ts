import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

async function createNotebook(page: Page, title = 'Field notes') {
  await page.getByRole('button', { name: 'Create a notebook', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notebook name' }).fill(title)
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Notebook title' })).toHaveValue(title)
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
}

async function draw(page: Page) {
  await page.getByRole('button', { name: 'Fit page', exact: true }).click()
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper did not render')
  await page.mouse.move(paper.x + paper.width * 0.2, paper.y + paper.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.6, paper.y + paper.height * 0.35, { steps: 18 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled()
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await expect.poll(() => page.getByTestId('ink-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas context missing')
    const pixels = context.getImageData(Math.round(canvas.width * 0.4) - 4, Math.round(canvas.height * 0.325) - 4, 9, 9).data
    let darkest = 255
    for (let index = 0; index < pixels.length; index += 4) {
      darkest = Math.min(darkest, Math.max(pixels[index], pixels[index + 1], pixels[index + 2]))
    }
    return darkest
  })).toBeLessThan(180)
}

async function documentAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Notebook options', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click()
}

async function setPaper(page: Page, template: string) {
  await page.getByRole('button', { name: 'Notebook options', exact: true }).click()
  await page.getByRole('combobox', { name: 'Paper template' }).selectOption(template)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
}

async function expectImportedBackground(page: Page) {
  await page.getByRole('button', { name: 'Notebook options', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Paper template' })).toBeDisabled()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
}

async function strokeCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('opennotes-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('pages').objectStore('pages').getAll()
        request.onsuccess = () => resolve(request.result.reduce((sum, page) => sum + page.strokes.length, 0))
        request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  })
}

test.beforeEach(async ({ page }) => { await page.goto('./') })

test('installation is discoverable and explains iPad Home Screen installation', async ({ page }) => {
  await page.getByRole('button', { name: 'Install app', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Install OpenNotes' })
  await expect(dialog).toContainText('Safari')
  await expect(dialog).toContainText('Add to Home Screen')
  await expect(dialog).toContainText('not a downloaded file')
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await expect(dialog).not.toBeVisible()
})

test('the app fills the visible viewport without document scrolling after height changes', async ({ page }) => {
  for (const height of [1050, 750, 430]) {
    await page.setViewportSize({ width: 834, height })
    await expect.poll(() => page.evaluate(() => {
      const app = document.querySelector('.app-shell')!.getBoundingClientRect()
      return Math.abs(app.bottom - (visualViewport?.height ?? innerHeight))
    })).toBeLessThanOrEqual(1)
    await page.evaluate(() => window.scrollTo(0, 1000))
    expect(await page.evaluate(() => scrollY)).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true)
  }
  await createNotebook(page, 'Viewport')
  await expect(page.getByRole('textbox', { name: 'Notebook title' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fit page' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true)
})

test('notebook view prioritizes the page with on-demand panels and focus mode', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 })
  await createNotebook(page, 'Page first')
  await expect(page.locator('.sidebar')).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'Notebook pages' })).toHaveCount(0)
  const viewport = await page.getByTestId('ink-viewport').boundingBox()
  const paper = await page.getByTestId('paper').boundingBox()
  if (!viewport || !paper) throw new Error('Writing workspace missing')
  expect(viewport.width).toBeGreaterThanOrEqual(830)
  expect(viewport.height).toBeGreaterThan(1194 * 0.85)
  expect(paper.width).toBeGreaterThan(834 * 0.94)
  await page.getByRole('button', { name: 'Show pages', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Notebook pages' })).toBeVisible()
  await page.getByRole('button', { name: 'Close pages', exact: true }).click()
  await page.getByRole('button', { name: 'Hide tools', exact: true }).click()
  await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toHaveCount(0)
  const focused = await page.getByTestId('ink-viewport').boundingBox()
  expect(focused!.height).toBeGreaterThan(viewport.height + 35)
  await page.getByRole('button', { name: 'Show tools', exact: true }).click()
  await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toBeVisible()
  await draw(page)
})

test('inserts image and ordered PDF pages after the current page, preserving existing ink offline', async ({ page, context }) => {
  await createNotebook(page, 'Mixed notebook')
  await draw(page)
  await page.getByRole('button', { name: 'Insert pages', exact: true }).click()
  await page.getByRole('button', { name: 'Add page', exact: true }).click()
  await page.getByRole('button', { name: 'Previous page', exact: true }).click()
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 300; canvas.height = 400
    const context = canvas.getContext('2d')!
    context.fillStyle = '#f2d8bc'; context.fillRect(0, 0, 300, 400)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600]).drawText('First inserted PDF page', { x: 30, y: 550 })
  pdf.addPage([600, 400]).drawText('Second inserted PDF page', { x: 30, y: 350 })
  await page.getByLabel('Insert PDF or images as pages').setInputFiles([
    { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') },
    { name: 'reference.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) },
  ])
  await expect(page.getByRole('button', { name: 'Show page overview', exact: true })).toHaveText('Page 2 of 5')
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await expectImportedBackground(page)
  await draw(page)
  expect(await strokeCount(page)).toBe(2)
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expectImportedBackground(page)
  let dimensions = await page.getByTestId('paper').evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }))
  expect(dimensions.height).toBeGreaterThan(dimensions.width)
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  dimensions = await page.getByTestId('paper').evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }))
  expect(dimensions.width).toBeGreaterThan(dimensions.height)
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await page.getByRole('button', { name: 'Notebook options', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Paper template' })).toBeEnabled()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Show page overview', exact: true })).toHaveText('Page 1 of 5')
  expect(await strokeCount(page)).toBe(2)
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expectImportedBackground(page)
  await page.getByRole('button', { name: 'Back to notebooks', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open Mixed notebook', exact: true })).toHaveCount(1)
})

test('invalid in-notebook imports fail atomically without adding partial pages', async ({ page }) => {
  await createNotebook(page, 'Import safety')
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 100; canvas.height = 100
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('Insert PDF or images as pages').setInputFiles([
    { name: 'valid.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') },
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
  ])
  await expect(page.getByRole('alert')).toContainText('could not be decoded')
  await expect(page.getByRole('button', { name: 'Show page overview', exact: true })).toHaveText('Page 1 of 1')
  const pdf = await PDFDocument.create()
  for (let i = 0; i < 51; i++) pdf.addPage([100, 100])
  await page.getByLabel('Insert PDF or images as pages').setInputFiles({
    name: 'too-many.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()),
  })
  await expect(page.getByRole('alert')).toContainText('up to 50 pages')
  await expect(page.getByRole('button', { name: 'Show page overview', exact: true })).toHaveText('Page 1 of 1')
})

test('creates, draws, undoes/redoes, changes pages, and persists after reload', async ({ page }) => {
  await createNotebook(page)
  await draw(page)
  expect(await strokeCount(page)).toBe(1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => strokeCount(page)).toBe(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(() => strokeCount(page)).toBe(1)
  await page.getByRole('button', { name: 'Insert pages', exact: true }).click()
  await page.getByRole('button', { name: 'Add page', exact: true }).click()
  await page.getByRole('button', { name: 'Show pages', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page')
  await draw(page)
  await expect.poll(() => strokeCount(page)).toBe(2)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Notebook title' })).toHaveValue('Field notes')
  await page.getByRole('button', { name: 'Show pages', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Page 2', exact: true })).toBeVisible()
  expect(await strokeCount(page)).toBe(2)
})

test('area eraser previews a cut, preserves both ends, and supports undo/redo and reload', async ({ page }) => {
  await createNotebook(page)
  await setPaper(page, 'plain')
  await draw(page)
  await page.getByRole('button', { name: 'Eraser', exact: true }).click()
  await page.getByRole('button', { name: 'Tool settings', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Eraser size' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper did not render')
  await page.mouse.move(paper.x + paper.width * 0.4, paper.y + paper.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.4, paper.y + paper.height * 0.5, { steps: 10 })
  await expect.poll(() => page.getByTestId('ink-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixel = canvas.getContext('2d')!.getImageData(Math.round(canvas.width * 0.4), Math.round(canvas.height * 0.325), 1, 1).data
    return Math.min(pixel[0], pixel[1], pixel[2])
  })).toBeGreaterThan(240)
  expect(await strokeCount(page)).toBe(1)
  await page.mouse.up()
  await expect.poll(() => strokeCount(page)).toBe(2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => strokeCount(page)).toBe(1)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(() => strokeCount(page)).toBe(2)
  await page.reload()
  await expect.poll(() => strokeCount(page)).toBe(2)
})

test('cancelled eraser previews restore the original ink', async ({ page }) => {
  await createNotebook(page, 'Cancelled eraser')
  await setPaper(page, 'plain')
  await draw(page)
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  await page.getByRole('button', { name: 'Eraser', exact: true }).click()
  await page.getByTestId('ink-viewport').evaluate(element => {
    element.addEventListener('pointerdown', event => element.setAttribute('data-pointer-id', String((event as PointerEvent).pointerId)), { once: true })
  })
  await page.mouse.move(paper.x + paper.width * 0.4, paper.y + paper.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.4, paper.y + paper.height * 0.5, { steps: 10 })
  const pointerId = Number(await page.getByTestId('ink-viewport').getAttribute('data-pointer-id'))
  await page.getByTestId('ink-viewport').dispatchEvent('pointercancel', { pointerId, pointerType: 'mouse' })
  await page.mouse.up()
  expect(await strokeCount(page)).toBe(1)
  await expect.poll(() => page.getByTestId('ink-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(Math.round(canvas.width * 0.4) - 4, Math.round(canvas.height * 0.325) - 4, 9, 9).data
    let darkest = 255
    for (let i = 0; i < pixels.length; i += 4) darkest = Math.min(darkest, Math.max(pixels[i], pixels[i + 1], pixels[i + 2]))
    return darkest
  })).toBeLessThan(180)
})

test('offline reload and writing work after service-worker activation', async ({ page, context }) => {
  await createNotebook(page, 'Offline notebook')
  await draw(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
    })
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Notebook title' })).toHaveValue('Offline notebook')
  await draw(page)
  expect(await strokeCount(page)).toBe(2)
  await page.reload()
  await expect.poll(() => strokeCount(page)).toBe(2)
})

test('exports a valid PDF and an editable backup and restores the backup', async ({ page }) => {
  await createNotebook(page, 'Backup test')
  await draw(page)
  const pdfDownload = page.waitForEvent('download')
  await documentAction(page, 'Export PDF')
  const pdf = await pdfDownload
  expect(pdf.suggestedFilename()).toMatch(/^Backup[ _]test\.pdf$/)
  const pdfStream = await pdf.createReadStream()
  if (!pdfStream) throw new Error('PDF download stream missing')
  const pdfChunks: Buffer[] = []
  for await (const chunk of pdfStream) pdfChunks.push(Buffer.from(chunk))
  const parsed = await PDFDocument.load(Buffer.concat(pdfChunks))
  expect(parsed.getPageCount()).toBe(1)

  const backupDownload = page.waitForEvent('download')
  await documentAction(page, 'Download notebook backup')
  const backup = await backupDownload
  const stream = await backup.createReadStream()
  if (!stream) throw new Error('Backup stream missing')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const buffer = Buffer.concat(chunks)
  expect(JSON.parse(buffer.toString()).notebooks[0].pages[0].strokes).toHaveLength(1)
  await page.getByRole('button', { name: 'Back to notebooks' }).click()
  await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({ name: 'restored.opennotes', mimeType: 'application/json', buffer })
  await expect(page.getByRole('button', { name: 'Open Backup test', exact: true })).toHaveCount(2)
})

test('imports a PDF and retains its page background after reload', async ({ page }) => {
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600]).drawText('Offline annotation test', { x: 30, y: 550 })
  await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({
    name: 'Reference.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()),
  })
  await expect(page.getByRole('textbox', { name: 'Notebook title' })).toHaveValue('Reference')
  await expectImportedBackground(page)
  await draw(page)
  await page.reload()
  await expectImportedBackground(page)
  expect(await strokeCount(page)).toBe(1)
})

test('PDF import and export work on a fresh offline session, without external requests', async ({ page, context }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
    })
  })
  await context.setOffline(true)
  await page.reload()
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600]).drawText('No internet required', { x: 30, y: 550 })
  await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({
    name: 'Offline.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()),
  })
  await expect(page.getByRole('textbox', { name: 'Notebook title' })).toHaveValue('Offline')
  const download = page.waitForEvent('download')
  await documentAction(page, 'Export PDF')
  expect((await download).suggestedFilename()).toBe('Offline.pdf')
})

test('cancelled strokes are discarded, without affecting committed ink', async ({ page }) => {
  await createNotebook(page)
  await draw(page)
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper did not render')
  await page.mouse.move(paper.x + paper.width * 0.3, paper.y + paper.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.5, paper.y + paper.height * 0.45)
  await page.getByTestId('ink-viewport').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', clientX: paper.x, clientY: paper.y })
  await page.mouse.up()
  expect(await strokeCount(page)).toBe(1)
})

test('reports quota failures and allows an editable backup of unsaved work', async ({ page }) => {
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('Test storage quota exceeded', 'QuotaExceededError') }
  })
  await page.getByRole('button', { name: 'Create a notebook', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notebook name' }).fill('Recover me')
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Changes are not saved')
  await expect(page.getByTestId('save-status')).toContainText('Not saved')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/^OpenNotes[ _]backup\.opennotes$/)
})

test('layouts fit desktop, iPad and narrow mobile screens without horizontal overflow', async ({ page }) => {
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await createNotebook(page, 'Responsive')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByTestId('ink-canvas')).toBeVisible()
})

test('Chromium pen input retains pressure samples', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP pressure injection is a Chromium-only browser test, not real Pencil certification.')
  await createNotebook(page, 'Pen pressure')
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  const session = await context.newCDPSession(page)
  const x = paper.x + paper.width * 0.3, y = paper.y + paper.height * 0.3
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.2 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 30, y: y + 10, button: 'left', buttons: 1, pointerType: 'pen', force: 0.8 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 30, y: y + 10, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen', force: 0 })
  await expect.poll(() => strokeCount(page)).toBe(1)
  const pressures = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open('opennotes-v1')
      request.onsuccess = () => resolve(request.result)
    })
    try {
      return await new Promise<number[]>(resolve => {
        const request = database.transaction('pages').objectStore('pages').getAll()
        request.onsuccess = () => resolve(request.result[0].strokes[0].points.map((p: { pressure: number }) => p.pressure))
      })
    } finally { database.close() }
  })
  expect(pressures.some(value => Math.abs(value - 0.2) < 0.01)).toBe(true)
  expect(pressures.some(value => Math.abs(value - 0.8) < 0.01)).toBe(true)
  await session.detach()
})

test('interrupted pen strokes survive cancellation and capture loss without duplicating or blocking later strokes', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Pen injection uses CDP; physical Pencil cancellation still requires iPad validation.')
  await createNotebook(page, 'Interrupted pen')
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  const session = await context.newCDPSession(page)
  const x = paper.x + paper.width * 0.3, y = paper.y + paper.height * 0.3
  for (const [index, interruption] of ['pointercancel', 'lostpointercapture'].entries()) {
    const startY = y + index * 30
    await page.getByTestId('ink-viewport').evaluate(element => {
      element.addEventListener('pointerdown', event => element.setAttribute('data-pointer-id', String((event as PointerEvent).pointerId)), { once: true })
    })
    await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: startY, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.3 })
    const pointerId = Number(await page.getByTestId('ink-viewport').getAttribute('data-pointer-id'))
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 50, y: startY + 10, button: 'left', buttons: 1, pointerType: 'pen', force: 0.8 })
    await page.getByTestId('ink-viewport').dispatchEvent(interruption, { pointerId, pointerType: 'pen', clientX: 0, clientY: 0 })
    await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 50, y: startY + 10, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen', force: 0 })
    await expect.poll(() => strokeCount(page)).toBe(index + 1)
  }
  await session.detach()
  await draw(page)
  expect(await strokeCount(page)).toBe(3)
  await page.reload()
  await expect.poll(() => strokeCount(page)).toBe(3)
})

test('rapid consecutive strokes do not reset the live canvas', async ({ page }) => {
  await createNotebook(page, 'Quick writing')
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  await page.evaluate(() => {
    const canvas = document.querySelector('.paper canvas:last-child')!
    canvas.setAttribute('data-resize-count', '0')
    new MutationObserver(records => {
      const changes = records.filter(record => record.attributeName === 'width' || record.attributeName === 'height').length
      if (changes) canvas.setAttribute('data-resize-count', String(Number(canvas.getAttribute('data-resize-count')) + changes))
    }).observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] })
  })
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(paper.x + paper.width * 0.3, paper.y + paper.height * 0.3 + i * 5)
    await page.mouse.down()
    await page.mouse.move(paper.x + paper.width * 0.5, paper.y + paper.height * 0.32 + i * 5, { steps: 3 })
    await page.mouse.up()
  }
  await expect.poll(() => strokeCount(page)).toBe(12)
  await expect(page.locator('.paper canvas:last-child')).toHaveAttribute('data-resize-count', '0')
  await page.reload()
  await expect.poll(() => strokeCount(page)).toBe(12)
})

test('Chromium two-finger pinch changes zoom without leaving accidental ink', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP multi-touch injection is Chromium-only; hardware gestures still need iPad testing.')
  await createNotebook(page, 'Gestures')
  await page.getByRole('button', { name: 'Fit page', exact: true }).click()
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  const session = await context.newCDPSession(page)
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const x = paper.x + paper.width / 2, y = paper.y + paper.height / 2
  const initial = paper.width
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: x - 25, y }, { id: 2, x: x + 25, y }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - 50, y }, { id: 2, x: x + 50, y }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => (await page.getByTestId('paper').boundingBox())?.width ?? 0).toBeGreaterThan(initial * 1.5)
  expect(await strokeCount(page)).toBe(0)
  await session.detach()
})

test('iPad automatically ignores finger ink without exposing a Pencil-only toggle', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The desktop project intentionally permits mouse and touch drawing by default.')
  await createNotebook(page, 'Palm-safe defaults')
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  await page.touchscreen.tap(paper.x + paper.width * 0.4, paper.y + paper.height * 0.3)
  expect(await strokeCount(page)).toBe(0)
  await expect(page.getByRole('checkbox', { name: 'Pencil only' })).toHaveCount(0)
})

test('palm-like touch cannot draw or pan before, during or just after a pen stroke', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Simultaneous pen and touch injection uses CDP, not actual iPad palm classification.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 })
  })
  await page.reload()
  await createNotebook(page, 'Palm guard')
  await page.getByRole('button', { name: 'Fit page', exact: true }).click()
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  const original = await page.getByTestId('paper').getAttribute('style')
  const session = await context.newCDPSession(page)
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const x = paper.x + paper.width * 0.35, y = paper.y + paper.height * 0.4
  const palm = async (count: number) => {
    const touches = Array.from({ length: count }, (_, index) => ({ id: index + 1, x: x + index * 30, y, radiusX: 35, radiusY: 25 }))
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches })
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches.map(point => ({ ...point, x: point.x + 40, y: point.y + 20 })) })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await palm(1)
  expect(await strokeCount(page)).toBe(0)
  await expect(page.getByTestId('paper')).toHaveAttribute('style', original!)
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.5 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 20, y: y + 10, button: 'left', buttons: 1, pointerType: 'pen', force: 0.7 })
  await palm(2)
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 20, y: y + 10, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen', force: 0 })
  await palm(2)
  await expect.poll(() => strokeCount(page)).toBe(1)
  await expect(page.getByTestId('paper')).toHaveAttribute('style', original!)
  await session.detach()
})

test('rejects invalid backups visibly without modifying notebooks', async ({ page }) => {
  await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({
    name: 'broken.opennotes', mimeType: 'application/json', buffer: Buffer.from('{"version":99}'),
  })
  await expect(page.getByRole('alert')).toContainText('not a supported OpenNotes backup')
  await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(0)
})

test('prevents concurrent editors from overwriting the same local library', async ({ page, context }) => {
  await createNotebook(page)
  const other = await context.newPage()
  await other.goto('./')
  await expect(other.getByRole('alert')).toContainText('already open in another tab')
  await expect(other.getByRole('button', { name: 'New notebook', exact: true })).toBeDisabled()
  await other.close()
})

test('delete requires confirmation and leaves the library empty', async ({ page }) => {
  await createNotebook(page, 'Temporary')
  await documentAction(page, 'Delete notebook')
  await page.getByRole('button', { name: 'Keep notebook', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Notebook title' })).toHaveValue('Temporary')
  await documentAction(page, 'Delete notebook')
  await page.getByRole('dialog').getByRole('button', { name: 'Delete notebook', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Your notebooks/ })).toBeVisible()
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Open Temporary', exact: true })).toHaveCount(0)
})
