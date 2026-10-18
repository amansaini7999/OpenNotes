import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.OPENNOTES_TEST_PORT || 4173)
const baseURL = `http://127.0.0.1:${port}${process.env.OPENNOTES_BASE_PATH || '/'}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'], browserName: 'webkit' } },
  ],
})
