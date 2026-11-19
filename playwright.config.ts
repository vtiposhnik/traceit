import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

const chromium =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)

export default defineConfig({
  testDir: './tests',
  workers: 2,
  timeout: 45000,
  use: {
    viewport: { width: 1360, height: 900 },
    launchOptions: { executablePath: chromium },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'production', use: { baseURL: 'http://127.0.0.1:4174' } },
    { name: 'development', use: { baseURL: 'http://127.0.0.1:4175' } },
  ],
  webServer: [
    {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
