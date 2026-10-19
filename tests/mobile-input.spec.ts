import { expect, test, type Page } from '@playwright/test'
import { pageSetting } from './editor-settings'

async function openNotebook(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Create a notebook', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notebook name' }).fill('Mobile input')
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click()
  await pageSetting(page, 'Fit page')
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

test('writing chrome rejects selection and callouts without blocking notebook title editing', async ({ page }) => {
  await openNotebook(page)
  const overview = page.getByRole('button', { name: 'Show page overview', exact: true })
  expect(await overview.evaluate(element => getComputedStyle(element).webkitUserSelect)).toBe('none')
  if (await page.evaluate(() => CSS.supports('-webkit-touch-callout', 'none'))) {
    expect(await overview.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-touch-callout'))).toBe('none')
  }
  const prevented = await overview.evaluate(element => ({
    selection: !element.dispatchEvent(new Event('selectstart', { bubbles: true, cancelable: true })),
    menu: !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
  }))
  expect(prevented).toEqual({ selection: true, menu: true })
  const writingTitle = page.getByTestId('notebook-title')
  expect(await writingTitle.evaluate(element => getComputedStyle(element).webkitUserSelect)).toBe('none')
  await expect(page.locator('.editor-header input')).toHaveCount(0)
  await page.getByRole('button', { name: 'Page settings', exact: true }).click()
  await page.getByRole('button', { name: 'Rename notebook', exact: true }).click()
  const title = page.getByRole('textbox', { name: 'Notebook title' })
  expect(await title.evaluate(element => getComputedStyle(element).webkitUserSelect)).toBe('text')
  expect(await title.evaluate(element => element.dispatchEvent(new Event('selectstart', { bubbles: true, cancelable: true })))).toBe(true)
})

test('selection protection includes status text and clears native-style selection outside the editor', async ({ page }) => {
  await openNotebook(page)
  const status = page.getByTestId('save-status')
  expect(await status.evaluate(element => getComputedStyle(element).webkitUserSelect)).toBe('none')
  expect(await page.locator('body').evaluate(element => !element.dispatchEvent(new Event('selectstart', { bubbles: true, cancelable: true })))).toBe(true)
  const surface = page.getByTestId('ink-viewport')
  expect(await surface.evaluate(element => {
    const event = new Event('touchstart', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'changedTouches', { value: [] })
    return !element.dispatchEvent(event)
  })).toBe(true)
  await status.evaluate(element => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  expect(await page.evaluate(() => window.getSelection()!.rangeCount)).toBe(0)
  await page.getByRole('button', { name: 'Back to notebooks', exact: true }).click()
  expect(await page.locator('html').evaluate(element => element.classList.contains('writing-session'))).toBe(false)
  expect(await page.getByRole('textbox', { name: 'Search notebooks' }).evaluate(element => element.dispatchEvent(new Event('selectstart', { bubbles: true, cancelable: true })))).toBe(true)
})

test('the writing surface has no bottom controls to hit with a resting palm', async ({ page }) => {
  await openNotebook(page)
  await expect(page.locator('.canvas-bottom')).toHaveCount(0)
  await page.getByRole('button', { name: 'Page settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Page settings', exact: true })
  await expect(settings.getByRole('combobox', { name: 'Paper template' })).toBeVisible()
  await expect(settings.getByRole('button', { name: 'Fit page', exact: true })).toBeVisible()
  await expect(settings.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible()
})

test('renaming is explicit and cannot select or edit the title while writing', async ({ page }) => {
  await openNotebook(page)
  await expect(page.locator('.editor-header input')).toHaveCount(0)
  const heading = page.getByTestId('notebook-title')
  expect(await heading.evaluate(element => !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true)
  await page.getByRole('button', { name: 'Page settings', exact: true }).click()
  await page.getByRole('button', { name: 'Rename notebook', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notebook title' }).fill('Renamed deliberately')
  await page.getByRole('button', { name: 'Save name', exact: true }).click()
  await expect(heading).toHaveText('Renamed deliberately')
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await page.reload()
  await expect(page.getByTestId('notebook-title')).toHaveText('Renamed deliberately')
  await expect(page.locator('.editor-header input')).toHaveCount(0)
})

test('Pencil hover does not suppress intentional finger tool selection', async ({ page }) => {
  await openNotebook(page)
  const viewport = page.getByTestId('ink-viewport')
  await viewport.dispatchEvent('pointermove', { pointerType: 'pen', pointerId: 71, buttons: 0, pressure: 0 })
  const pan = page.getByRole('button', { name: 'Pan', exact: true })
  await pan.evaluate(element => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 72, pointerType: 'touch', button: 0, buttons: 1 }))
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 72, pointerType: 'touch', button: 0 }))
    element.dispatchEvent(new PointerEvent('click', { bubbles: true, cancelable: true, pointerType: 'touch', detail: 1 }))
  })
  await expect(pan).toHaveAttribute('aria-pressed', 'true')
})

test('palm touches on the title and settings cannot interrupt an active Pencil stroke', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Simultaneous native pen/touch injection uses CDP, not physical Apple Pencil hardware.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 })
  })
  await openNotebook(page)
  const paper = await page.getByTestId('paper').boundingBox()
  const title = await page.getByTestId('notebook-title').boundingBox()
  const settings = await page.getByRole('button', { name: 'Page settings', exact: true }).boundingBox()
  if (!paper || !title || !settings) throw new Error('Editor geometry missing')
  const session = await context.newCDPSession(page)
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const x = paper.x + paper.width * 0.2, y = paper.y + paper.height * 0.3
  await page.evaluate(() => getSelection()?.removeAllRanges())
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5, clickCount: 1 })
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: title.x + title.width / 2, y: title.y + title.height / 2, radiusX: 35, radiusY: 25 }] })
  await page.waitForTimeout(900)
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 2, x: settings.x + settings.width / 2, y: settings.y + settings.height / 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('')
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 100, y, buttons: 1, pointerType: 'pen', force: 0.6 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 100, y, button: 'left', buttons: 0, pointerType: 'pen', force: 0, clickCount: 1 })
  await expect.poll(async () => (await ink(page)).length).toBe(1)
  expect((await ink(page))[0].points.at(-1)!.x).toBeGreaterThan(794 * 0.2 + 70 * 794 / paper.width)
  await page.waitForTimeout(800)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 3, x: settings.x + settings.width / 2, y: settings.y + settings.height / 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('dialog', { name: 'Page settings', exact: true })).toBeVisible()
  await session.detach()
})

test('a resting palm at the old footer location cannot select text, turn pages or interrupt pen ink', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Simultaneous pen/touch injection requires CDP; native iPad menus still need device validation.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 })
  })
  await openNotebook(page)
  await page.getByRole('button', { name: 'Add content', exact: true }).click()
  await page.getByRole('button', { name: 'Add page', exact: true }).click()
  await pageSetting(page, 'Previous page')
  const paper = await page.getByTestId('paper').boundingBox()
  const viewport = await page.getByTestId('ink-viewport').boundingBox()
  if (!paper || !viewport) throw new Error('Writing surface missing')
  const palm = { x: viewport.x + 60, y: viewport.y + viewport.height - 20 }
  expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('button,select,input,a')), palm)).toBe(false)
  await page.evaluate(() => getSelection()?.removeAllRanges())
  const pen = { x: paper.x + paper.width * 0.2, y: paper.y + paper.height * 0.3 }
  const session = await context.newCDPSession(page)
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...pen, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5, clickCount: 1 })
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...palm, radiusX: 35, radiusY: 25 }] })
  await page.waitForTimeout(900)
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pen.x + 100, y: pen.y, buttons: 1, pointerType: 'pen', force: 0.6 })
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pen.x + 100, y: pen.y, button: 'left', buttons: 0, pointerType: 'pen', force: 0, clickCount: 1 })
  await page.waitForTimeout(800)
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('button', { name: 'Show page overview' })).toHaveText('Page 1 of 2')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('')
  await expect.poll(async () => (await ink(page)).length).toBe(1)
  expect((await ink(page))[0].points.at(-1)!.x).toBeGreaterThan(794 * 0.2 + 70 * 794 / paper.width)
  const settings = await page.getByRole('button', { name: 'Page settings', exact: true }).boundingBox()
  if (!settings) throw new Error('Page settings missing')
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 2, x: settings.x + settings.width / 2, y: settings.y + settings.height / 2 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('dialog', { name: 'Page settings', exact: true })).toBeVisible()
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
  await expect(page.getByTestId('notebook-title')).toHaveText('Mobile input')
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
