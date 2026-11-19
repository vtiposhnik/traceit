import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('Openverse search failure leaves the studio collection usable', async ({ page }) => {
  await page.route('https://api.openverse.org/**', (route) => route.abort('failed'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Reference library', exact: true }).click()
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Openverse could not be reached')
  await page.getByRole('button', { name: 'Studio collection', exact: true }).click()
  await page
    .getByRole('article')
    .filter({ hasText: 'Nautilus shell' })
    .getByRole('button', { name: 'Use reference' })
    .click()
  await page.getByRole('button', { name: 'Start practice' }).click()
  await expect(page.locator('.reference-identity')).toContainText('Nautilus shell')
  await expect(page.locator('.reference-photo')).toHaveJSProperty('naturalWidth', 768)
})

test('Openverse adapter filters a search, falls back to a readable thumbnail and retains attribution', async ({
  page,
}) => {
  const queryStrings: string[] = []
  let originalRequests = 0
  let failThumb = true
  const item = {
    id: 'test-image',
    title: 'Licensed pear study',
    creator: 'Example Artist',
    license: 'by',
    license_version: '4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    foreign_landing_url: 'https://example.org/original',
    thumbnail: 'https://api.openverse.org/v1/images/test-image/thumb/',
    url: 'https://images.example.org/pear.webp',
  }
  await page.route('https://api.openverse.org/v1/images/?**', async (route) => {
    queryStrings.push(new URL(route.request().url()).searchParams.get('q') ?? '')
    await route.fulfill({ json: { results: [item] }, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await page.route(item.url, (route) => {
    originalRequests++
    return route.abort('accessdenied')
  })
  await page.route(item.thumbnail, (route) =>
    failThumb
      ? route.abort('failed')
      : route.fulfill({
          contentType: 'image/webp',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: readFileSync('public/studies/pear-study.webp'),
        }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Reference library', exact: true }).click()
  await page.getByRole('button', { name: 'Explore', exact: true }).click()
  await page.getByRole('searchbox').fill('pear')
  await page.getByLabel('Subject filter').selectOption('Botanical')
  await expect.poll(() => queryStrings).toContain('pear Botanical')
  await page.getByRole('button', { name: 'Use reference', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('readable copy')
  failThumb = false
  await page.getByRole('button', { name: 'Use reference', exact: true }).click()
  await page.getByRole('button', { name: 'Start practice' }).click()
  await expect(page.locator('.reference-photo')).toHaveJSProperty('naturalWidth', 768)
  await expect(page.getByRole('link', { name: 'Example Artist' })).toHaveAttribute(
    'href',
    item.foreign_landing_url,
  )
  await expect(page.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', item.license_url)
  expect(originalRequests).toBe(2)
  await page.getByRole('button', { name: 'Finish tracing', exact: true }).click()
  await page.getByRole('button', { name: 'Finish reconstruction', exact: true }).click()
  await page.getByRole('button', { name: 'Finish session', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Session history', exact: true }).click()
  await page.getByRole('button', { name: 'Open comparison', exact: true }).click()
  await page.getByRole('switch', { name: 'Reveal original' }).click()
  await expect(page.locator('.reference-photo')).toHaveJSProperty('naturalWidth', 768)
})
