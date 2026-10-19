import { expect, test, type Page } from '@playwright/test'
import { pageSetting } from './editor-settings'
import { createNotebook, emptyLibrary, type Stroke } from '../src/model'

async function start(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Create a notebook', exact: true }).click()
  await page.getByRole('textbox', { name: 'Notebook name' }).fill('Ink revision')
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click()
  await pageSetting(page, 'Fit page')
  await page.getByRole('button', { name: 'Page settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Paper template' }).selectOption('plain')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
}

async function drawLine(page: Page) {
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  await page.mouse.move(paper.x + paper.width * 0.2, paper.y + paper.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.7, paper.y + paper.height * 0.3, { steps: 30 })
  await page.mouse.up()
}

async function savedNotebook(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('opennotes-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<{ updatedAt: number; strokes: { penStyle?: string }[] }>((resolve, reject) => {
        const tx = db.transaction(['notebooks', 'pages'])
        const notes = tx.objectStore('notebooks').getAll()
        const pages = tx.objectStore('pages').getAll()
        tx.oncomplete = () => resolve({ updatedAt: notes.result[0].updatedAt, strokes: pages.result.flatMap(page => page.strokes) })
        tx.onerror = () => reject(tx.error)
      })
    } finally { db.close() }
  })
}

async function overlayPixels(page: Page) {
  return page.getByTestId('temporary-ink').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) count++
    return count
  })
}

test('new ballpoint ink has a smooth shared outline and survives reload', async ({ page }) => {
  await start(page)
  await drawLine(page)
  await expect.poll(async () => (await savedNotebook(page)).strokes.length).toBe(1)
  expect((await savedNotebook(page)).strokes[0].penStyle).toBe('ballpoint')
  const thicknesses = await page.getByTestId('ink-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')!
    return [0.3, 0.4, 0.5, 0.6].map(x => {
      const pixels = context.getImageData(Math.round(canvas.width * x), Math.round(canvas.height * 0.3) - 15, 1, 31).data
      let dark = 0
      for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 180) dark++
      return dark
    })
  })
  expect(Math.min(...thicknesses)).toBeGreaterThan(2)
  expect(Math.max(...thicknesses) - Math.min(...thicknesses)).toBeLessThanOrEqual(2)
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await page.reload()
  expect((await savedNotebook(page)).strokes[0].penStyle).toBe('ballpoint')
})

test('temporary pen fades away without changing saved notes or permanent ink', async ({ page }) => {
  await start(page)
  const before = await savedNotebook(page)
  await page.getByRole('button', { name: 'Temporary pen', exact: true }).click()
  await page.getByRole('button', { name: 'Tool settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Temporary ink lifetime' }).selectOption('2')
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await drawLine(page)
  await expect.poll(() => overlayPixels(page)).toBeGreaterThan(100)
  expect(await savedNotebook(page)).toEqual(before)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await expect.poll(() => overlayPixels(page), { timeout: 5000 }).toBe(0)
  expect(await savedNotebook(page)).toEqual(before)
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await drawLine(page)
  await expect.poll(async () => (await savedNotebook(page)).strokes.length).toBe(1)
})

test('dense, sparse and legacy straight ink has no gaps along horizontal, vertical or diagonal lines', async ({ page }) => {
  const note = createNotebook('Continuous lines', undefined, 'plain')
  const lines = [{ x: 100, y: 150, dx: 600, dy: 0 }, { x: 180, y: 300, dx: 0, dy: 600 }, { x: 300, y: 300, dx: 350, dy: 550 }]
  const strokes: Stroke[] = lines.map((line, index) => ({
    id: crypto.randomUUID(), tool: 'pen', color: '#253a43', width: 3, penStyle: index === 1 ? undefined : 'ballpoint',
    points: Array.from({ length: index === 2 ? 20 : 400 }, (_, sample) => ({
      x: line.x + line.dx * sample / (index === 2 ? 19 : 399),
      y: line.y + line.dy * sample / (index === 2 ? 19 : 399),
      pressure: sample % 2 ? 0.2 : 0.8,
    })),
  }))
  note.pages[0].strokes = strokes
  await page.goto('./')
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({ name: 'lines.opennotes', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...emptyLibrary(), notebooks: [note] })) })
  await page.getByRole('button', { name: 'Restore notebooks', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Restore complete:' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Continuous lines', exact: true }).click()
  const gaps = () => page.getByTestId('ink-canvas').evaluate((canvas: HTMLCanvasElement, lines) => {
    const context = canvas.getContext('2d')!, scale = canvas.width / 794
    return lines.map(line => {
      let missing = 0
      const length = Math.max(line.dx, line.dy) * scale
      for (let sample = 5; sample < length - 5; sample++) {
        const x = Math.round((line.x + line.dx * sample / length) * scale), y = Math.round((line.y + line.dy * sample / length) * scale)
        const vertical = line.dx === 0
        const pixels = context.getImageData(x - (vertical ? 4 : 0), y - (vertical ? 0 : 4), vertical ? 9 : 1, vertical ? 1 : 9).data
        let dark = false
        for (let index = 0; index < pixels.length; index += 4) if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) < 160) dark = true
        if (!dark) missing++
      }
      return missing
    })
  }, lines)
  await expect.poll(gaps).toEqual([0, 0, 0])
  await page.reload()
  await expect.poll(gaps).toEqual([0, 0, 0])
})

test('laser label exposes its timer and the trail disappears during an uninterrupted stroke', async ({ page }) => {
  await start(page)
  await expect(page.getByRole('button', { name: 'Select images', exact: true })).toHaveText('Images')
  const laser = page.getByRole('button', { name: 'Temporary pen', exact: true })
  await expect(laser).toHaveText('Laser · 2s')
  const centers = await page.getByRole('toolbar', { name: 'Drawing tools' }).locator('.tool-group:first-child button svg').evaluateAll(icons => icons.map(icon => {
    const bounds = icon.getBoundingClientRect()
    return bounds.y + bounds.height / 2
  }))
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1)
  await laser.click()
  await page.clock.install()
  const paper = await page.getByTestId('paper').boundingBox()
  if (!paper) throw new Error('Paper missing')
  const before = await savedNotebook(page)
  const y = paper.y + paper.height * 0.3
  await page.mouse.move(paper.x + paper.width * 0.2, y)
  await page.mouse.down()
  await page.mouse.move(paper.x + paper.width * 0.4, y, { steps: 12 })
  await page.clock.runFor(1200)
  await page.mouse.move(paper.x + paper.width * 0.6, y, { steps: 12 })
  await page.clock.runFor(1000)
  const alphaAt = (fraction: number) => page.getByTestId('temporary-ink').evaluate((canvas: HTMLCanvasElement, fraction) => {
    const pixels = canvas.getContext('2d')!.getImageData(Math.round(canvas.width * fraction), Math.round(canvas.height * 0.3) - 8, 1, 17).data
    return Math.max(...Array.from(pixels).filter((_, index) => index % 4 === 3))
  }, fraction)
  expect(await alphaAt(0.3)).toBe(0)
  expect(await alphaAt(0.55)).toBeGreaterThan(0)
  expect(await savedNotebook(page)).toEqual(before)
  await page.mouse.up()
  expect(await alphaAt(0.3)).toBe(0)
  await page.clock.runFor(2400)
  expect(await overlayPixels(page)).toBe(0)
  expect(await savedNotebook(page)).toEqual(before)
})
