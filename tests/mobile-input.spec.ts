import { expect, test, type Page } from '@playwright/test'

async function openNotebook(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Create a notebook', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notebook name' }).fill('Mobile input')
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click()
  await page.getByRole('button', { name: 'Fit page', exact: true }).click()
}

async function ink(page: Page): Promise<{ points: { x: number; y: number; pressure: number }[] }[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('opennotes-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<{ points: { x: number; y: number; pressure: number }[] }[]>((resolve, reject) => {
        const request = database.transaction('pages').objectStore('pages').getAll()
        request.onsuccess = () => resolve(request.result.flatMap(page => page.strokes))
        request.onerror = () => reject(request.error)
      })
    } finally { database.close() }
  })
}

test('a lost pen capture does not end the stroke or drop subsequent contact samples', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native pen injection uses CDP; real Apple Pencil testing is still required.')
  await openNotebook(page)
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  const x = paper.x + paper.width * 0.2, y = paper.y + paper.height * 0.3
  await page.getByTestId('ink-viewport').evaluate(element => element.addEventListener('pointerdown', event => element.setAttribute('data-pointer-id', String((event as PointerEvent).pointerId)), { once: true }))
  const session = await context.newCDPSession(page)
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5, clickCount: 1 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 20, y, buttons: 1, pointerType: 'pen', force: 0.6 })
  const pointerId = Number(await page.getByTestId('ink-viewport').getAttribute('data-pointer-id'))
  await page.getByTestId('ink-viewport').evaluate((element, id) => element.releasePointerCapture(id), pointerId)
  for (let dx = 40; dx <= 120; dx += 20) await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y, buttons: 1, pointerType: 'pen', force: 0.6 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 120, y, button: 'left', buttons: 0, pointerType: 'pen', force: 0, clickCount: 1 })
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await expect.poll(async () => (await ink(page))[0]?.points.at(-1)?.x ?? 0).toBeGreaterThan(794 * 0.2 + 90 * 794 / paper.width)
  expect(await ink(page)).toHaveLength(1)
  await session.detach()
})

test('phone-mode finger drags produce continuous ink instead of being rejected as palm input', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Continuous touch injection uses CDP; iPhone WebKit separately tests native touch contacts.')
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }))
  await openNotebook(page)
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  const session = await context.newCDPSession(page)
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const x = paper.x + paper.width * 0.2, y = paper.y + paper.height * 0.3
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] })
  for (let dx = 10; dx <= 70; dx += 10) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x + dx, y }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => (await ink(page)).length).toBe(1)
  expect((await ink(page))[0].points.length).toBeGreaterThan(5)
  await expect(page.getByRole('button', { name: 'Show page overview' })).toHaveText('Page 1 of 1')
  await session.detach()
})

test('app interruption commits sampled pen ink and permits the next stroke', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Pen contact injection uses CDP.')
  await openNotebook(page)
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  const session = await context.newCDPSession(page)
  const x = paper.x + paper.width * 0.2, y = paper.y + paper.height * 0.3
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5, clickCount: 1 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 40, y, buttons: 1, pointerType: 'pen', force: 0.6 })
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect.poll(async () => (await ink(page)).length).toBe(1)
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 40, y, button: 'left', buttons: 0, pointerType: 'pen', force: 0, clickCount: 1 })
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: y + 30, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5, clickCount: 1 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 40, y: y + 30, button: 'left', buttons: 0, pointerType: 'pen', force: 0, clickCount: 1 })
  await expect.poll(async () => (await ink(page)).length).toBe(2)
  await session.detach()
})

test('iPhone native finger contacts draw, undo and survive reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-webkit', 'This regression targets native iPhone-shaped WebKit touch input.')
  await openNotebook(page)
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  await page.touchscreen.tap(paper.x + paper.width * 0.3, paper.y + paper.height * 0.3)
  await page.touchscreen.tap(paper.x + paper.width * 0.4, paper.y + paper.height * 0.35)
  await expect.poll(async () => (await ink(page)).length).toBe(2)
  await expect.poll(() => page.getByTestId('ink-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(Math.round(canvas.width * 0.3) - 4, Math.round(canvas.height * 0.3) - 4, 9, 9).data
    let darkest = 255
    for (let i = 0; i < pixels.length; i += 4) darkest = Math.min(darkest, Math.max(pixels[i], pixels[i + 1], pixels[i + 2]))
    return darkest
  })).toBeLessThan(180)
  await page.getByRole('button', { name: 'Show pages', exact: true }).click()
  await expect(page.locator('.page-preview circle[fill="#253a43"]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await ink(page)).length).toBe(1)
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Notebook title' })).toHaveValue('Mobile input')
  expect(await ink(page)).toHaveLength(1)
})

test('pen input continues outside the viewport after capture loss and finishes on outside release', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native pen injection uses CDP.')
  await openNotebook(page)
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  const x = paper.x + paper.width * 0.25, y = paper.y + paper.height * 0.3
  await page.getByTestId('ink-viewport').evaluate(element => element.addEventListener('pointerdown', event => element.setAttribute('data-pointer-id', String((event as PointerEvent).pointerId)), { once: true }))
  const session = await context.newCDPSession(page)
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5, clickCount: 1 })
  const id = Number(await page.getByTestId('ink-viewport').getAttribute('data-pointer-id'))
  await page.getByTestId('ink-viewport').evaluate((element, id) => element.releasePointerCapture(id), id)
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8, buttons: 1, pointerType: 'pen', force: 0.6 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 8, y: 8, button: 'left', buttons: 0, pointerType: 'pen', force: 0, clickCount: 1 })
  await expect.poll(async () => (await ink(page)).length).toBe(1)
  const last = (await ink(page))[0].points.at(-1)!
  expect(last.x).toBe(0)
  expect(last.y).toBe(0)
  expect(last.pressure).toBeCloseTo(0.6)
  await session.detach()
})

test('browser persistence is requested automatically and Help reports the actual result', async ({ page }) => {
  await page.addInitScript(() => {
    let granted = false
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {
      persisted: async () => granted,
      persist: async () => {
        document.documentElement.dataset.persistenceRequests = String(Number(document.documentElement.dataset.persistenceRequests ?? '0') + 1)
        granted = true
        return true
      },
    } })
  })
  await openNotebook(page)
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.persistenceRequests)).toBe('1')
  await page.getByRole('button', { name: 'Back to notebooks', exact: true }).click()
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(page.getByTestId('storage-protection')).toContainText('Browser persistence is granted')
  await expect(page.getByTestId('storage-protection')).toContainText('not an external-file backup')
  await expect(page.getByRole('button', { name: 'Request storage protection' })).toHaveCount(0)
})

test('a denied persistence request is not presented as protected storage', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => false, persist: async () => false } })
  })
  await openNotebook(page)
  await page.getByRole('button', { name: 'Back to notebooks', exact: true }).click()
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(page.getByTestId('storage-protection')).toContainText('persistence is not granted')
  await expect(page.getByTestId('storage-protection')).toContainText('may evict')
})
