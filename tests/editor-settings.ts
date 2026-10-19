import type { Page } from '@playwright/test'

export async function pageSetting(page: Page, action: 'Fit page' | 'Fit width' | 'Next page' | 'Previous page' | 'Zoom in' | 'Zoom out') {
  await page.getByRole('button', { name: 'Page settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Page settings', exact: true })
  await settings.getByRole('button', { name: action, exact: true }).click()
  await settings.getByRole('button', { name: 'Close dialog', exact: true }).click()
}
