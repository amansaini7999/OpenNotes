import { expect, test, type Page } from '@playwright/test'
import { createNotebook, createPage, emptyLibrary } from '../src/model'
import { pageSetting } from './editor-settings'

async function seed(page: Page, count = 8, landscape = false) {
  const note = createNotebook('Reading and scrolling', undefined, 'plain')
  note.pages = Array.from({ length: count }, () => landscape ? { ...createPage('plain'), width: 1200, height: 400 } : createPage('plain'))
  await page.goto('./')
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({ name: 'reading.opennotes', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...emptyLibrary(), notebooks: [note] })) })
  await page.getByRole('button', { name: 'Restore notebooks', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Restore complete:' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Reading and scrolling', exact: true }).click()
  const stored = JSON.parse(await snapshot(page))
  return { ...note, pages: note.pages.map((page, index) => ({ ...page, id: stored.notes[0].pageIds[index] as string })) }
}

async function chooseMode(page: Page, mode: 'swipe' | 'scroll') {
  await page.getByRole('button', { name: 'Page settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Page navigation mode' }).selectOption(mode)
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('opennotes-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<string>((resolve, reject) => {
        const tx = db.transaction(['notebooks', 'pages', 'assets'])
        const notes = tx.objectStore('notebooks').getAll(), pages = tx.objectStore('pages').getAll(), assets = tx.objectStore('assets').getAll()
        tx.oncomplete = () => resolve(JSON.stringify({ notes: notes.result, pages: pages.result, assets: assets.result }))
        tx.onerror = () => reject(tx.error)
      })
    } finally { db.close() }
  })
}

test('vertical navigation is continuous, virtualized and remembered across reload', async ({ page }) => {
  const note = await seed(page, 30)
  await chooseMode(page, 'scroll')
  const scroll = page.getByTestId('scroll-notebook')
  await expect(scroll).toBeVisible()
  expect(await page.getByTestId('ink-viewport').count()).toBeLessThanOrEqual(5)
  await scroll.evaluate((element, id) => {
    const frame = element.querySelector(`[data-page-id="${id}"]`) as HTMLElement
    element.scrollTop = frame.offsetTop
  }, note.pages[10].id)
  await expect(page.getByRole('button', { name: 'Show page overview' })).toHaveText('Page 11 of 30')
  const frame = page.locator(`[data-page-id="${note.pages[10].id}"]`)
  await expect(frame.getByTestId('ink-canvas')).toBeVisible()
  expect(await page.getByTestId('ink-viewport').count()).toBeLessThanOrEqual(5)
  await page.reload()
  await expect(page.getByTestId('scroll-notebook')).toBeVisible()
  await chooseMode(page, 'swipe')
  await expect(page.getByTestId('scroll-notebook')).toHaveCount(0)
  await expect(page.getByTestId('ink-viewport')).toHaveCount(1)
})

test('editing a scrolled page stores ink on that page, not the first page', async ({ page }) => {
  const note = await seed(page, 5)
  await chooseMode(page, 'scroll')
  await pageSetting(page, 'Next page')
  await expect(page.getByRole('button', { name: 'Show page overview' })).toHaveText('Page 2 of 5')
  const frame = page.locator(`[data-page-id="${note.pages[1].id}"]`)
  const paper = await frame.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Scrolled paper missing')
  await page.mouse.move(paper.x + paper.width * 0.2, paper.y + 80)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.6, paper.y + 90, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  const stored = JSON.parse(await snapshot(page))
  expect(stored.pages.find((page: { id: string }) => page.id === note.pages[0].id).strokes).toHaveLength(0)
  expect(stored.pages.find((page: { id: string }) => page.id === note.pages[1].id).strokes).toHaveLength(1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => JSON.parse(await snapshot(page)).pages.find((page: { id: string }) => page.id === note.pages[1].id).strokes.length).toBe(0)
})

test('read mode blocks writing, undo, imports and paper changes while retaining navigation', async ({ page }) => {
  await seed(page, 3)
  await pageSetting(page, 'Fit page')
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  await page.mouse.move(paper.x + paper.width * 0.2, paper.y + paper.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.6, paper.y + paper.height * 0.35, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  const before = await snapshot(page)
  await page.getByRole('button', { name: 'Read mode', exact: true }).click()
  await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add content', exact: true })).toBeDisabled()
  await page.mouse.move(paper.x + paper.width * 0.3, paper.y + paper.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.7, paper.y + paper.height * 0.45, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.press('Control+z')
  expect(await snapshot(page)).toBe(before)
  await page.getByRole('button', { name: 'Page settings', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Paper template' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Rename notebook', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show page overview' })).toHaveText('Page 2 of 3')
  expect(await snapshot(page)).toBe(before)
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click()
  await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toBeVisible()
})

test('tablet fingers scroll in vertical mode and read mode without adding ink', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch drag injection uses CDP; real iPad scrolling still needs hardware testing.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 })
  })
  await seed(page, 8, true)
  await chooseMode(page, 'scroll')
  const scroll = page.getByTestId('scroll-notebook')
  const bounds = await scroll.boundingBox()
  if (!bounds) throw new Error('Scroll viewport missing')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height * 0.7
  const gesture = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] })
    for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x, y: y - step * 22 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await gesture()
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(100)
  const before = await snapshot(page)
  await page.getByRole('button', { name: 'Read mode', exact: true }).click()
  const top = await scroll.evaluate(element => element.scrollTop)
  await gesture()
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(top + 50)
  expect(await snapshot(page)).toBe(before)
  await cdp.detach()
})
