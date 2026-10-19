import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function ready(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
}

async function createFolder(page: Page, name: string) {
  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  await page.getByRole('textbox', { name: 'Folder name', exact: true }).fill(name)
  await page.getByRole('button', { name: 'Create folder', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await ready(page)
}

async function createNote(page: Page, name: string) {
  await page.getByRole('button', { name: 'Something new starts here Create a notebook' }).click()
  await page.getByRole('textbox', { name: 'Notebook name' }).fill(name)
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click()
  await ready(page)
  await page.getByRole('button', { name: 'Back to notebooks', exact: true }).click()
}

async function backup(page: Page) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Back up everything', exact: true }).click()
  const path = await (await download).path()
  if (!path) throw new Error('Backup download missing')
  return readFile(path)
}

test('nested folders support creation, notebook moves, rename, safe deletion and durable backups', async ({ page }) => {
  await page.goto('./')
  await ready(page)
  await createFolder(page, 'MBBS')
  await page.getByRole('button', { name: 'Open folder MBBS', exact: true }).click()
  await createFolder(page, 'Anatomy')
  await page.getByRole('button', { name: 'Open folder Anatomy', exact: true }).click()
  await createNote(page, 'Nerves revision')
  const before = JSON.parse((await backup(page)).toString())
  const original = before.notebooks[0]
  expect(before.folders).toHaveLength(2)
  expect(original.folderId).toBe(before.folders.find((folder: { name: string }) => folder.name === 'Anatomy').id)
  await page.getByRole('button', { name: 'Manage folder Anatomy', exact: true }).click()
  await page.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Neuroanatomy')
  await page.getByRole('button', { name: 'Save folder', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Neuroanatomy 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Notebook actions for Nerves revision', exact: true }).click()
  await page.getByRole('button', { name: 'Move Nerves revision', exact: true }).click()
  await page.getByRole('combobox', { name: 'Destination folder', exact: true }).selectOption({ label: 'MBBS' })
  await page.getByRole('button', { name: 'Move notebook', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open Nerves revision', exact: true })).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Folder path' }).getByRole('button', { name: 'MBBS', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open Nerves revision', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Manage folder MBBS', exact: true }).click()
  await page.getByRole('button', { name: 'Delete folder', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('No notebook or page will be deleted')
  await page.getByRole('button', { name: 'Delete folder', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open Nerves revision', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open folder Neuroanatomy', exact: true })).toBeVisible()
  await page.reload()
  await ready(page)
  const after = JSON.parse((await backup(page)).toString())
  expect(after.folders).toHaveLength(1)
  expect(after.folders[0]).toMatchObject({ name: 'Neuroanatomy' })
  expect(after.folders[0].parentId).toBeUndefined()
  expect(after.notebooks).toHaveLength(1)
  expect(after.notebooks[0]).toEqual({ ...original, folderId: undefined })
})

test('folder backup restore is idempotent and old backups still open', async ({ page }) => {
  await page.goto('./')
  await ready(page)
  await createFolder(page, 'Research')
  await page.getByRole('button', { name: 'Open folder Research', exact: true }).click()
  await createFolder(page, 'Immunology')
  await page.getByRole('button', { name: 'Open folder Immunology', exact: true }).click()
  await createNote(page, 'Experiments')
  const data = await backup(page)
  await page.getByRole('button', { name: 'Notebook actions for Experiments', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Experiments', exact: true }).click()
  await page.getByRole('button', { name: 'Delete notebook', exact: true }).click()
  await ready(page)
  for (let index = 0; index < 2; index++) {
    await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({ name: 'folders.opennotes', mimeType: 'application/json', buffer: data })
    await page.getByRole('button', { name: 'Restore notebooks', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Restore complete:' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  const restored = JSON.parse((await backup(page)).toString())
  expect(restored.folders).toHaveLength(2)
  expect(restored.notebooks).toHaveLength(1)
  await expect(page.getByRole('button', { name: 'Open Experiments', exact: true })).toBeVisible()
  const legacy = { ...restored, folders: undefined, notebooks: restored.notebooks.map((note: object) => ({ ...note, folderId: undefined })) }
  await page.getByLabel('Import PDF or OpenNotes backup').setInputFiles({ name: 'legacy.opennotes', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) })
  await page.getByRole('button', { name: 'Restore notebooks', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(JSON.parse((await backup(page)).toString()).notebooks).toHaveLength(1)
})

test('duplicate folder names show an actionable error and cannot create cycles', async ({ page }) => {
  await page.goto('./')
  await ready(page)
  await createFolder(page, 'UPSC')
  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  await page.getByRole('textbox', { name: 'Folder name', exact: true }).fill(' upsc ')
  await page.getByRole('button', { name: 'Create folder', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('already exists')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Open folder UPSC', exact: true }).click()
  await createFolder(page, 'History')
  await page.getByRole('button', { name: 'Manage folder UPSC', exact: true }).click()
  const destinations = page.getByRole('combobox', { name: 'Parent folder', exact: true }).locator('option')
  await expect(destinations).toHaveCount(1)
  await expect(destinations).toHaveText(['Top level'])
})
