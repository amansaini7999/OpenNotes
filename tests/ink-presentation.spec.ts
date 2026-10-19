import { expect, test, type Page } from '@playwright/test'
import { pageSetting } from './editor-settings'

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
