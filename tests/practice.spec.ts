import { expect, test, type Page, type Locator } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { Session } from '../src/exercise/engine'

const main = (page: Page) => page.getByRole('application', { name: 'Main drawing surface' })
async function imageBox(surface: Locator) {
  const box = await surface.locator('.paper').boundingBox()
  if (!box || !box.width) throw new Error('Drawing paper is missing')
  return box
}
async function draw(page: Page, offset = 0, hold = false) {
  const b = await imageBox(main(page))
  const positions = [
    [0.3, 0.68],
    [0.36, 0.46],
    [0.43, 0.34],
    [0.58, 0.4],
    [0.66, 0.65],
  ]
  await page.mouse.move(b.x + b.width * (positions[0][0] + offset), b.y + b.height * positions[0][1])
  await page.mouse.down()
  for (const [x, y] of positions.slice(1))
    await page.mouse.move(b.x + b.width * (x + offset), b.y + b.height * y, { steps: 5 })
  if (!hold) await page.mouse.up()
}
async function pixels(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const ctx = element.getContext('2d')!
    const data = ctx.getImageData(0, 0, element.width, element.height).data
    let count = 0
    for (let i = 3; i < data.length; i += 4) if (data[i]) count++
    return count
  })
}
async function stored(page: Page): Promise<Session[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('traceit-studio')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    try {
      return await new Promise<Session[]>((resolve, reject) => {
        const req = db.transaction('sessions').objectStore('sessions').getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  })
}
const next = (page: Page) => page.getByRole('button', { name: 'Finish tracing', exact: true }).click()
const reconstruct = (page: Page) => page.getByRole('button', { name: 'Finish reconstruction', exact: true })
async function sessionReady(page: Page) {
  await expect(page.locator('.local-indicator')).toHaveText('Session saved')
  return (await stored(page))[0]
}

test('free practice transfers the tracing, aligns independent layers and reopens the exact saved drawings', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Reference library', exact: true }).click()
  await page
    .getByRole('article')
    .filter({ hasText: 'Terracotta pitcher' })
    .getByRole('button', { name: 'Use reference' })
    .click()
  const setup = page.getByRole('dialog')
  await setup.getByLabel('Free practice', { exact: false }).check()
  await setup.getByRole('button', { name: 'Start practice' }).click()
  const base = main(page).locator('.ink-layer')
  await draw(page, 0, true)
  await expect(main(page)).toHaveClass(/drawing/)
  await expect
    .poll(() =>
      main(page)
        .locator('img')
        .evaluate((e) => Number(getComputedStyle(e).opacity)),
    )
    .toBeLessThan(0.6)
  await page.mouse.up()
  await expect.poll(() => pixels(base)).toBeGreaterThan(120)
  await expect
    .poll(() =>
      main(page)
        .locator('img')
        .evaluate((e) => Number(getComputedStyle(e).opacity)),
    )
    .toBeCloseTo(0.85)
  const initial = await imageBox(main(page))
  await next(page)
  const ghost = page.locator('.transfer-sheet')
  await expect(ghost).toBeAttached()
  const flight = await ghost.evaluate((sheet: HTMLCanvasElement) => {
    const effect = sheet.getAnimations()[0].effect as KeyframeEffect
    const frames = effect.getKeyframes()
    const end = new DOMMatrixReadOnly(String(frames[frames.length - 1].transform))
    return {
      duration: effect.getTiming().duration,
      startX: parseFloat(sheet.style.left),
      endX: parseFloat(sheet.style.left) + end.e,
      endY: parseFloat(sheet.style.top) + end.f,
      endWidth: parseFloat(sheet.style.width) * end.a,
    }
  })
  expect(flight.duration).toBe(300)
  expect(flight.startX).toBeCloseTo(initial.x, 0)
  await expect(reconstruct(page)).toBeEnabled()
  await expect(page.locator('.reference-photo')).toHaveCount(0)
  const preview = page.getByRole('application', { name: 'Traced reference', exact: true })
  await expect.poll(() => pixels(preview.locator('.ink-layer'))).toBeGreaterThan(10)
  const landing = await imageBox(preview)
  expect(flight.endX).toBeCloseTo(landing.x, 0)
  expect(flight.endY).toBeCloseTo(landing.y, 0)
  expect(flight.endWidth).toBeCloseTo(landing.width, 0)
  expect(await pixels(base)).toBe(0)
  await page.getByRole('button', { name: 'Zoom in tracing', exact: true }).click()
  await expect(page.locator('.preview-controls')).toContainText('125%')
  const box = await imageBox(preview)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 12)
  await page.mouse.up()
  await expect.poll(async () => (await imageBox(preview)).x).toBeCloseTo(box.x + 15, 0)
  await page.getByRole('button', { name: 'Hide traced reference' }).click()
  await expect(preview).toBeHidden()
  await page.getByRole('button', { name: 'Show traced reference' }).click()
  await expect(preview).toBeVisible()
  await expect.poll(async () => (await imageBox(preview)).x).toBeCloseTo(box.x + 15, 0)
  await expect(page.locator('.preview-controls')).toContainText('125%')
  await draw(page, 0.06)
  await reconstruct(page).click()
  const original = await sessionReady(page)
  expect(original.reference.id).toBe('studio/terracotta-pitcher')
  expect(original.trace).toHaveLength(1)
  expect(original.reconstruct).toHaveLength(1)
  expect(original.comparison.offset).toEqual({ x: 0, y: 0 })
  expect(original.drawingTime.trace).toBeGreaterThan(0)
  expect(original.drawingTime.reconstruct).toBeGreaterThan(0)
  expect(original.elapsed.trace).toBeGreaterThanOrEqual(original.drawingTime.trace)
  expect(original.completedAt).toBeGreaterThan(0)
  const b = await imageBox(main(page))
  const moveLayer = async (dx: number, dy: number) => {
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.47)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width * 0.5 + dx, b.y + b.height * 0.47 + dy, { steps: 6 })
    await page.mouse.up()
  }
  await moveLayer(40, 20)
  await expect
    .poll(async () => (await stored(page))[0].comparison.offset.x)
    .toBeCloseTo((40 * 1000) / b.width, 0)
  const shifted = (await stored(page))[0]
  expect(shifted.trace).toEqual(original.trace)
  expect(shifted.reconstruct).toEqual(original.reconstruct)
  await page.getByRole('button', { name: 'Reset alignment' }).click()
  await expect.poll(async () => (await stored(page))[0].comparison.offset).toEqual({ x: 0, y: 0 })
  await page.getByRole('button', { name: 'Hide tracing', exact: true }).click()
  await expect(base).toHaveCSS('opacity', '0')
  await page.getByRole('button', { name: 'Show tracing', exact: true }).click()
  const alpha = page.getByRole('slider', { name: 'Reconstruction opacity' })
  await alpha.focus()
  await alpha.press('Home')
  await alpha.press('ArrowRight')
  await expect(main(page).locator('.overlay-layer')).toHaveCSS('opacity', '0.01')
  await alpha.press('End')
  await page.getByRole('switch', { name: 'Reveal original' }).click()
  await expect(main(page).locator('img')).toBeVisible()
  await page.getByRole('switch', { name: 'Reveal original' }).click()
  await page.getByRole('button', { name: 'Separate', exact: true }).click()
  for (const label of ['Tracing', 'Reconstruction']) {
    await expect
      .poll(() =>
        pixels(
          page
            .getByRole('application', { name: label + ' separate view' })
            .locator('canvas')
            .first(),
        ),
      )
      .toBeGreaterThan(10)
  }
  await page.getByRole('button', { name: 'Overlay', exact: true }).click()
  await moveLayer(11, -15)
  await page.getByRole('button', { name: 'Finish session' }).click()
  await expect(page.getByRole('dialog', { name: 'Session complete' })).toBeVisible()
  const saved = (await stored(page))[0]
  expect(saved.comparison.offset.x).not.toBe(0)
  await page.reload()
  await page.getByRole('button', { name: 'Session history', exact: true }).click()
  await page.getByRole('button', { name: 'Open comparison' }).click()
  await expect(page.getByRole('heading', { name: 'Compare drawings' })).toBeVisible()
  await expect.poll(() => pixels(base)).toBeGreaterThan(120)
  await expect.poll(() => pixels(main(page).locator('.overlay-layer'))).toBeGreaterThan(120)
  expect((await stored(page))[0]).toEqual(saved)
  expect(initial.width).toBeGreaterThan(400)
  await page.getByRole('button', { name: 'Finish session' }).click()
  await page.getByRole('button', { name: 'Repeat this reference' }).click()
  await page.getByRole('button', { name: 'Start practice' }).click()
  await expect(page.locator('.reference-identity')).toContainText('Terracotta pitcher')
  await expect.poll(() => pixels(base)).toBe(0)
  expect(await stored(page)).toHaveLength(1)
  expect(errors).toEqual([])
})

test('tools erase and restore ink, undo clear, and preserve image coordinates under pan, zoom and resize', async ({
  page,
}) => {
  await page.goto('/')
  const base = main(page).locator('.ink-layer')
  await draw(page)
  await expect.poll(() => pixels(base)).toBeGreaterThan(0)
  const first = await pixels(base)
  await page.getByRole('button', { name: 'Eraser (E)', exact: true }).click()
  await draw(page)
  await expect.poll(() => pixels(base)).toBeLessThan(first / 2)
  await page.keyboard.press('Control+z')
  await expect.poll(() => pixels(base)).toBe(first)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(() => pixels(base)).toBeLessThan(first / 2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('button', { name: 'Clear drawing' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await pixels(base)).toBe(first)
  await page.getByRole('button', { name: 'Clear drawing' }).click()
  await page.getByRole('button', { name: 'Clear layer' }).click()
  await expect.poll(() => pixels(base)).toBe(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => pixels(base)).toBe(first)
  await page.getByRole('switch', { name: 'Adaptive dimming' }).click()
  await page.getByRole('button', { name: 'Pencil (B)', exact: true }).click()
  await page.getByRole('slider', { name: 'Brush size' }).press('End')
  await page.getByRole('slider', { name: 'Reference opacity' }).press('Home')
  await expect
    .poll(() =>
      main(page)
        .locator('img')
        .evaluate((e) => Number(getComputedStyle(e).opacity)),
    )
    .toBe(0)
  const before = await imageBox(main(page))
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(async () => (await imageBox(main(page))).width).toBeCloseTo(before.width * 1.25, 0)
  await page.getByRole('button', { name: 'Pan (H)' }).click()
  await draw(page)
  await page.getByRole('button', { name: 'Pencil (B)', exact: true }).click()
  await page.getByRole('button', { name: 'Fit drawing to board' }).click()
  await expect.poll(async () => (await imageBox(main(page))).x).toBeCloseTo(before.x, 0)
  await page.setViewportSize({ width: 1060, height: 780 })
  // The resize observer schedules the paper layout and backing store update on the next frame.
  await expect
    .poll(() =>
      base.evaluate(
        (canvas: HTMLCanvasElement) =>
          canvas.width === Math.round(canvas.clientWidth * devicePixelRatio) &&
          canvas.height === Math.round(canvas.clientHeight * devicePixelRatio),
      ),
    )
    .toBe(true)
  const fit = await imageBox(main(page))
  const anchorX = fit.x + fit.width / 2
  const anchorY = fit.y + fit.height / 2
  await page.mouse.move(anchorX, anchorY)
  await page.mouse.wheel(0, -120)
  await expect.poll(async () => (await imageBox(main(page))).width).toBeGreaterThan(fit.width)
  const zoomed = await imageBox(main(page))
  expect((anchorX - zoomed.x) / zoomed.width).toBeCloseTo(0.5, 2)
  await page.keyboard.down('Space')
  await page.mouse.down()
  await page.mouse.move(anchorX + 16, anchorY - 9, { steps: 3 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await expect.poll(async () => (await imageBox(main(page))).x).toBeCloseTo(zoomed.x + 16, 0)
  await draw(page)
  await next(page)
  await expect(reconstruct(page)).toBeEnabled()
  await reconstruct(page).click()
  const { trace } = await sessionReady(page)
  expect(trace).toHaveLength(2)
  expect(trace[1].size).toBe(40)
  for (const index of [0, 1])
    expect(Math.abs(trace[0].points[0][index] - trace[1].points[0][index])).toBeLessThan(3)
})

test('timed practice pauses, restarts and finishes a captured stroke at the stage deadline', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Change practice mode' }).click()
  await page.getByLabel('Timed challenge', { exact: false }).check()
  for (const preset of ['30 sec', '60 sec', '2 min', '5 min'])
    await expect(page.getByRole('button', { name: preset, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Custom', exact: true }).click()
  await page.getByLabel('Seconds per stage').fill('3')
  await page.getByRole('button', { name: 'Start practice' }).click()
  await page.getByRole('button', { name: 'Pause timer' }).click()
  await page.waitForTimeout(3150)
  await expect(page.getByRole('heading', { name: 'Practice paused' })).toBeVisible()
  await expect(page.locator('.stage-rail [aria-current=step]')).toContainText('Trace')
  await page.getByRole('button', { name: 'Resume practice' }).click()
  await draw(page)
  await page.getByRole('button', { name: 'Restart challenge', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Restart challenge' }).click()
  await expect.poll(() => pixels(main(page).locator('.ink-layer'))).toBe(0)
  await draw(page, 0, true)
  await expect(reconstruct(page)).toBeEnabled({ timeout: 6000 })
  await page.mouse.up()
  await draw(page, 0.05)
  await expect(page.getByRole('heading', { name: 'Compare drawings' })).toBeVisible({ timeout: 6000 })
  await expect(page.getByRole('timer')).toHaveCount(0)
  const session = await sessionReady(page)
  expect(session.config).toEqual({ mode: 'timed', seconds: 3 })
  expect(session.trace).toHaveLength(1)
  expect(session.reconstruct).toHaveLength(1)
  expect(session.elapsed.trace).toBeCloseTo(3000, -1)
  expect(session.elapsed.reconstruct).toBeCloseTo(3000, -1)
})

test.describe('narrow touch workspace', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  test('uploads and renames an image, draws with touch and pen, and reopens a session after removing the original', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Reference library', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Add images' })).toHaveCount(0)
    await page.getByRole('button', { name: 'My library', exact: true }).click()
    const addImages = page.getByRole('button', { name: 'Add images', exact: true })
    const chooser = page.waitForEvent('filechooser')
    await addImages.click()
    await (
      await chooser
    ).setFiles({
      name: 'Local shell.webp',
      mimeType: 'image/webp',
      buffer: readFileSync('public/studies/nautilus-shell.webp'),
    })
    await expect(page.locator('.library-grid > :first-child')).toHaveAccessibleName('Add images')
    await page.getByRole('button', { name: 'View Local shell', exact: true }).click()
    await page.getByRole('button', { name: 'Rename image' }).click()
    await page.getByLabel('Reference name').fill('Shell from my desk')
    await page.getByRole('button', { name: 'Save name' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Use reference' }).click()
    await page.getByRole('button', { name: 'Start practice' }).click()
    await expect(main(page).locator('img')).toHaveJSProperty('naturalWidth', 768)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    const b = await imageBox(main(page))
    expect(b.width).toBeGreaterThan(270)
    const cdp = await context.newCDPSession(page)
    const p = (x: number, y: number, force: number) => ({
      x: b.x + b.width * x,
      y: b.y + b.height * y,
      force,
      id: 1,
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p(0.35, 0.4, 0.2)] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p(0.48, 0.5, 0.6)] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p(0.57, 0.63, 0.8)] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await expect.poll(() => pixels(main(page).locator('.ink-layer'))).toBeGreaterThan(30)
    await next(page)
    await expect(reconstruct(page)).toBeEnabled()
    await page.getByRole('button', { name: 'Hide traced reference' }).click()
    await page.getByRole('button', { name: 'Tracing', exact: true }).click()
    await expect(page.getByRole('application', { name: 'Traced reference' })).toBeVisible()
    await page.getByRole('button', { name: 'Hide traced reference' }).click()
    const sheet = await imageBox(main(page))
    for (const [type, x, pressure] of [
      ['mousePressed', 0.35, 0.18],
      ['mouseMoved', 0.45, 0.6],
      ['mouseMoved', 0.65, 0.9],
      ['mouseReleased', 0.65, 0],
    ] as const) {
      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x: sheet.x + sheet.width * x,
        y: sheet.y + sheet.height * 0.52,
        pointerType: 'pen',
        force: pressure,
        button: 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
      })
    }
    await reconstruct(page).click()
    const s = await sessionReady(page)
    expect(s.trace[0].points.length).toBeGreaterThan(1)
    expect(s.reconstruct[0].simulatePressure).toBe(false)
    const pressure = s.reconstruct[0].points.map((p) => p[2])
    expect(Math.max(...pressure) - Math.min(...pressure)).toBeGreaterThan(0.5)
    expect(s.reference.title).toBe('Shell from my desk')
    await page.getByRole('button', { name: 'Finish session' }).click()
    await page.getByRole('button', { name: 'Choose another reference' }).click()
    await page.getByRole('button', { name: 'My library', exact: true }).click()
    await page.getByRole('button', { name: 'View Shell from my desk' }).click()
    await page.getByRole('button', { name: 'Remove image' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove image' }).click()
    await expect(page.getByRole('button', { name: 'View Shell from my desk' })).toHaveCount(0)
    await page.reload()
    await page.getByRole('button', { name: 'Session history', exact: true }).click()
    await page.getByRole('button', { name: 'Open comparison' }).click()
    await page.getByRole('switch', { name: 'Reveal original' }).click()
    await expect(main(page).locator('img')).toHaveJSProperty('naturalWidth', 768)
    expect((await stored(page))[0].reconstruct).toEqual(s.reconstruct)
  })
})

test('save failure keeps both drawings available and Finish session retries the write', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'sessions' && !sessionStorage.getItem('allow-session-write')) {
        throw new DOMException('Simulated full storage', 'QuotaExceededError')
      }
      return put.apply(this, args)
    }
  })
  await page.goto('/')
  await draw(page)
  await next(page)
  await expect(reconstruct(page)).toBeEnabled()
  await draw(page, 0.05)
  await reconstruct(page).click()
  await expect(page.getByRole('alert')).toContainText('could not save')
  await expect.poll(() => pixels(main(page).locator('.ink-layer'))).toBeGreaterThan(0)
  await expect.poll(() => pixels(main(page).locator('.overlay-layer'))).toBeGreaterThan(0)
  await page.evaluate(() => sessionStorage.setItem('allow-session-write', '1'))
  await page.getByRole('button', { name: 'Finish session' }).click()
  await expect(page.getByRole('dialog', { name: 'Session complete' })).toBeVisible()
  const saved = await sessionReady(page)
  expect(saved.trace).toHaveLength(1)
  expect(saved.reconstruct).toHaveLength(1)
})

test('lower-right marks survive release and remain in place across reference and comparison views', async ({
  page,
}) => {
  await page.goto('/')
  async function drawMark(y: number) {
    const b = await imageBox(main(page))
    await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * y)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * y, { steps: 14 })
    await page.mouse.up()
  }
  async function expectMark(surface: Locator, y: number, layer = '.ink-layer') {
    await expect
      .poll(() =>
        surface.evaluate(
          (el, { y, layer }) => {
            const paper = el.querySelector('.paper')!.getBoundingClientRect()
            const canvas = el.querySelector<HTMLCanvasElement>(layer)!
            const rect = canvas.getBoundingClientRect()
            const xPixel = ((paper.left + 0.77 * paper.width - rect.left) * canvas.width) / rect.width
            const yPixel = ((paper.top + y * paper.height - rect.top) * canvas.height) / rect.height
            const rgba = canvas
              .getContext('2d')!
              .getImageData(Math.round(xPixel) - 2, Math.round(yPixel) - 2, 5, 5).data
            return rgba.some((alpha, i) => i % 4 === 3 && alpha > 0)
          },
          { y, layer },
        ),
      )
      .toBe(true)
  }
  await drawMark(0.85)
  await expectMark(main(page), 0.85)
  await next(page)
  await expect(reconstruct(page)).toBeEnabled()
  await expectMark(page.getByRole('application', { name: 'Traced reference' }), 0.85)
  await drawMark(0.71)
  await expectMark(main(page), 0.71)
  await reconstruct(page).click()
  await expectMark(main(page), 0.85)
  await expectMark(main(page), 0.71, '.overlay-layer')
  const overlayBox = await imageBox(main(page))
  const x = overlayBox.x + 0.55 * overlayBox.width
  const y = overlayBox.y + 0.5 * overlayBox.height
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 24, y + 32)
  await page.mouse.up()
  await expect.poll(async () => (await stored(page))[0]?.comparison.offset.x).toBeGreaterThan(0)
  const splitViews = ['Tracing', 'Reconstruction'].map((name) =>
    page.getByRole('application', { name: name + ' separate view' }),
  )
  for (const repeat of [false, true]) {
    await page.getByRole('button', { name: 'Separate', exact: true }).click()
    await expectMark(splitViews[0], 0.85)
    await expectMark(splitViews[1], 0.71)
    if (!repeat) {
      const initial = await Promise.all(splitViews.map(imageBox))
      for (const [i, surface] of splitViews.entries()) {
        await surface.hover()
        await page.mouse.wheel(0, -160)
        await expect.poll(async () => (await imageBox(surface)).width).toBeGreaterThan(initial[i].width)
        await page.mouse.down()
        await page.mouse.move(initial[i].x + 0.6 * initial[i].width, initial[i].y + 0.6 * initial[i].height)
        await page.mouse.up()
      }
      await page.getByRole('button', { name: 'Reset alignment' }).click()
      for (const [i, surface] of splitViews.entries()) {
        await expect.poll(() => imageBox(surface)).toEqual(initial[i])
      }
      await expect.poll(async () => (await stored(page))[0].comparison.offset).toEqual({ x: 0, y: 0 })
    }
    await page.getByRole('button', { name: 'Overlay', exact: true }).click()
    await expectMark(main(page), 0.85)
    await expectMark(main(page), 0.71, '.overlay-layer')
  }
})

test('Compare scales only reconstruction and links the two Separate cameras', async ({ page }) => {
  await page.goto('/')
  await draw(page)
  await next(page)
  await expect(reconstruct(page)).toBeEnabled()
  await draw(page)
  await reconstruct(page).click()
  const session = await sessionReady(page)
  const scale = page.getByRole('slider', { name: 'Reconstruction scale' })
  const overlay = main(page).locator('.overlay-layer')
  const base = main(page).locator('.ink-layer')
  const basePixels = await pixels(base)
  const fullPixels = await pixels(overlay)
  expect(fullPixels).toBeGreaterThan(100)
  await scale.press('Home')
  await expect(scale).toHaveValue('25')
  await expect.poll(() => pixels(overlay)).toBeLessThan(fullPixels / 4)
  expect(await pixels(overlay)).toBeGreaterThan(0)
  expect(await pixels(base)).toBe(basePixels)
  await scale.press('End')
  await expect(scale).toHaveValue('400')
  await expect.poll(async () => (await stored(page))[0].comparison.reconstructionScale).toBe(400)
  await page.getByRole('button', { name: 'Separate', exact: true }).click()
  const link = page.getByRole('switch', { name: 'Link pan and zoom' })
  await expect(link).toBeChecked()
  const tracing = page.getByRole('application', { name: 'Tracing separate view' })
  const reconstruction = page.getByRole('application', { name: 'Reconstruction separate view' })
  const initial = await imageBox(tracing)
  const other = await imageBox(reconstruction)
  await tracing.hover()
  await page.mouse.wheel(0, -160)
  await expect.poll(async () => (await imageBox(reconstruction)).width).toBeGreaterThan(other.width)
  const zoomed = await imageBox(tracing)
  expect(zoomed.width / initial.width).toBeCloseTo((await imageBox(reconstruction)).width / other.width, 2)
  await reconstruction.hover()
  const center = await reconstruction.boundingBox()
  await page.mouse.down()
  await page.mouse.move(center!.x + center!.width / 2 + 30, center!.y + center!.height / 2)
  await page.mouse.up()
  await expect.poll(async () => (await imageBox(tracing)).x).toBeCloseTo(zoomed.x + 30, 0)
  await link.click()
  const stationary = await imageBox(tracing)
  const before = await imageBox(reconstruction)
  await reconstruction.hover()
  await page.mouse.wheel(0, 160)
  await expect.poll(async () => (await imageBox(reconstruction)).width).toBeLessThan(before.width)
  expect(await imageBox(tracing)).toEqual(stationary)
  await link.click()
  await expect.poll(async () => (await imageBox(reconstruction)).width).toBeCloseTo(before.width, 0)
  await page.getByRole('button', { name: 'Overlay', exact: true }).click()
  await expect(scale).toHaveValue('400')
  await page.getByRole('button', { name: 'Reset alignment' }).click()
  await expect(scale).toHaveValue('100')
  await expect.poll(() => pixels(overlay)).toBe(fullPixels)
  expect((await stored(page))[0].reconstruct).toEqual(session.reconstruct)
})

async function openBackup(page: Page) {
  await page.getByRole('button', { name: 'Session history', exact: true }).click()
  await page.getByRole('button', { name: 'Studio backup', exact: true }).click()
}

async function downloadedFile(page: Page, action: string) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: action, exact: true }).click()
  const path = await (await download).path()
  if (!path) throw new Error('Missing backup download')
  return path
}

async function restoreFile(page: Page, path: string) {
  await openBackup(page)
  await page.getByLabel('Backup file').setInputFiles(path)
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Restore studies' }).click(),
  ])
}

for (const viewport of [{ width: 1360, height: 900 }, { width: 820, height: 1180 }]) {
  test(`resumes, retries, and restores an uploaded study at width ${viewport.width}`, async ({ page, context, browser }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: 'Reference library', exact: true }).click()
    await page.getByRole('button', { name: 'My library', exact: true }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Add images', exact: true }).click()
    await (await chooser).setFiles({
      name: 'Study shell.webp',
      mimeType: 'image/webp',
      buffer: readFileSync('public/studies/nautilus-shell.webp'),
    })
    await page.getByRole('button', { name: 'View Study shell', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Use reference' }).click()
    await page.getByRole('button', { name: 'Start practice' }).click()
    await draw(page)
    await next(page)
    await expect(reconstruct(page)).toBeEnabled()
    await draw(page)
    await draw(page, 0.08)
    await page.getByRole('button', { name: 'Clear drawing' }).click()
    await page.getByRole('button', { name: 'Clear layer' }).click()
    await expect.poll(() => pixels(main(page).locator('.ink-layer'))).toBe(0)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(() => pixels(main(page).locator('.ink-layer'))).toBeGreaterThan(0)
    await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible()
    await page.close()
    const reopened = await context.newPage()
    await reopened.setViewportSize(viewport)
    await reopened.goto('/')
    await expect(reconstruct(reopened)).toBeEnabled()
    await expect.poll(() => pixels(main(reopened).locator('.ink-layer'))).toBeGreaterThan(0)
    await reopened.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect.poll(() => pixels(main(reopened).locator('.ink-layer'))).toBe(0)
    await reopened.getByRole('button', { name: 'Undo', exact: true }).click()
    await draw(reopened, -0.08)
    await reconstruct(reopened).click()
    const session = await sessionReady(reopened)
    expect(session.trace).toHaveLength(1)
    expect(session.reconstruct).toHaveLength(3)
    expect(session.reference.title).toBe('Study shell')
    await reopened.getByRole('switch', { name: 'Reveal original' }).click()
    await expect(main(reopened).locator('img')).toHaveJSProperty('naturalWidth', 768)
    await reopened.reload()
    await expect(reopened.getByRole('button', { name: 'Finish tracing' })).toBeVisible()
    expect(await stored(reopened)).toHaveLength(1)
    await reopened.getByRole('button', { name: 'Session history', exact: true }).click()
    await reopened.getByRole('button', { name: 'Open comparison' }).click()
    await reopened.getByRole('button', { name: 'Try reconstruction again' }).click()
    await expect(reconstruct(reopened)).toBeEnabled()
    await expect.poll(() => pixels(main(reopened).locator('.ink-layer'))).toBe(0)
    expect(await stored(reopened)).toHaveLength(1)
    await draw(reopened, 0.04)
    await reconstruct(reopened).click()
    await expect(reopened.locator('.local-indicator')).toHaveText('Session saved')
    const attempts = await stored(reopened)
    expect(attempts).toHaveLength(2)
    const retry = attempts.find((s) => s.id !== session.id)!
    expect(retry.retryOf).toBe(session.id)
    expect(retry.trace).toEqual(session.trace)
    expect(retry.reconstruct).toHaveLength(1)
    await openBackup(reopened)
    const path = await downloadedFile(reopened, 'Download backup')
    const fresh = await browser.newContext({ baseURL: reopened.url(), viewport })
    try {
      const restored = await fresh.newPage()
      await restored.goto('/')
      await restoreFile(restored, path)
      expect(await stored(restored)).toEqual(attempts)
      await restored.getByRole('button', { name: 'Session history', exact: true }).click()
      await restored.getByRole('button', { name: 'Open comparison' }).first().click()
      await restored.getByRole('switch', { name: 'Reveal original' }).click()
      await expect(main(restored).locator('img')).toHaveJSProperty('naturalWidth', 768)
      const scale = restored.getByRole('slider', { name: 'Reconstruction scale' })
      await scale.press('End')
      await expect.poll(async () => (await stored(restored)).find((s) => s.id === retry.id)?.comparison.reconstructionScale).toBe(400)
      await restored.getByRole('button', { name: 'Reference library', exact: true }).click()
      await restored.getByRole('button', { name: 'My library', exact: true }).click()
      await expect(restored.getByRole('button', { name: 'View Study shell' })).toBeVisible()
    } finally {
      await fresh.close()
    }
  })
}

test('a failed stroke save keeps editable ink available for download and retry', async ({ page, browser }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'desk' && !sessionStorage.getItem('allow-desk-write'))
        throw new DOMException('Full storage', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.goto('/')
  await draw(page)
  await expect(page.locator('.local-indicator')).toHaveText('Save failed')
  await expect.poll(() => pixels(main(page).locator('.ink-layer'))).toBeGreaterThan(0)
  const path = await downloadedFile(page, 'Download this study')
  const fresh = await browser.newContext({ baseURL: page.url() })
  try {
    const restored = await fresh.newPage()
    await restored.goto('/')
    await restoreFile(restored, path)
    await expect.poll(() => pixels(main(restored).locator('.ink-layer'))).toBeGreaterThan(0)
    await restored.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(() => pixels(main(restored).locator('.ink-layer'))).toBe(0)
  } finally {
    await fresh.close()
  }
  await page.evaluate(() => sessionStorage.setItem('allow-desk-write', '1'))
  await page.getByRole('button', { name: 'Retry save' }).click()
  await expect(page.locator('.local-indicator')).toHaveText('Saved on this device')
  await page.reload()
  await expect.poll(() => pixels(main(page).locator('.ink-layer'))).toBeGreaterThan(0)
})

test('a stale tab cannot silently replace newer drawings', async ({ page, context }) => {
  await page.goto('/')
  await draw(page)
  await expect(page.locator('.local-indicator')).toHaveText('Saved on this device')
  const second = await context.newPage()
  await second.goto('/')
  await expect.poll(() => pixels(main(second).locator('.ink-layer'))).toBeGreaterThan(0)
  await draw(page, 0.08)
  await expect(page.locator('.local-indicator')).toHaveText('Saved on this device')
  await draw(second, -0.08)
  await expect(second.getByRole('alert')).toContainText('Another tab changed the saved desk')
  second.once('dialog', (dialog) => dialog.dismiss())
  await second.getByRole('button', { name: 'Use this tab’s study' }).click()
  await expect(second.locator('.local-indicator')).toHaveText('Save failed')
  second.once('dialog', (dialog) => dialog.accept())
  await second.getByRole('button', { name: 'Use this tab’s study' }).click()
  await expect(second.locator('.local-indicator')).toHaveText('Saved on this device')
  await second.reload()
  await next(second)
  await reconstruct(second).click()
  const session = await sessionReady(second)
  expect(session.trace).toHaveLength(2)
  expect(session.trace[1].points[0][0]).toBeLessThan(session.trace[0].points[0][0])
})

test('upgrading an existing studio preserves its saved references', async ({ page }) => {
  // Seed the previous schema on the app origin before loading the new studio.
  await page.goto('/mark.svg')
  await page.evaluate(async () => {
    const req = indexedDB.open('traceit-studio', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('sessions', { keyPath: 'id' })
      const library = req.result.createObjectStore('references', { keyPath: 'id' })
      library.put({
        id: 'legacy-reference', source: 'upload', title: 'My saved shell', subject: 'Study',
        width: 768, height: 512, url: '/studies/nautilus-shell.webp', creator: 'Artist', license: '',
      })
    }
    await new Promise<void>((resolve, reject) => {
      req.onerror = () => reject(req.error)
      req.onsuccess = () => { req.result.close(); resolve() }
    })
  })
  await page.goto('/')
  await draw(page)
  await expect(page.locator('.local-indicator')).toHaveText('Saved on this device')
  await page.getByRole('button', { name: 'Reference library', exact: true }).click()
  await page.getByRole('button', { name: 'My library', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View My saved shell' })).toBeVisible()
})

test('invalid backups and failed restore transactions preserve existing studies', async ({ page }) => {
  await page.goto('/')
  await draw(page)
  await next(page)
  await reconstruct(page).click()
  const existing = await sessionReady(page)
  await openBackup(page)
  const path = await downloadedFile(page, 'Download backup')
  const archive = JSON.parse(readFileSync(path, 'utf8'))
  const input = page.getByLabel('Backup file')
  const file = (data: unknown) => ({
    name: 'studio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  })
  await input.setInputFiles(file({ ...archive, images: [] }))
  await expect(page.getByRole('dialog')).toContainText('could not be opened')
  await expect(page.getByRole('button', { name: 'Restore studies' })).toHaveCount(0)
  expect(await stored(page)).toEqual([existing])
  const incoming = ['first-import', 'last-import'].map((id) => ({ ...archive.sessions[0], id }))
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'sessions' && args[0].id === 'last-import')
        throw new DOMException('Simulated full storage', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await input.setInputFiles(file({ ...archive, sessions: incoming }))
  await page.getByRole('button', { name: 'Restore studies' }).click()
  await expect(page.getByRole('dialog')).toContainText('Restore failed')
  expect(await stored(page)).toEqual([existing])
})

test('Value Breakdown paints three tones beside the reference and restores an editable study', async ({ page, browser }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Change practice mode' }).click()
  await page.getByRole('radio', { name: /Value Breakdown/ }).check()
  await page.getByRole('button', { name: 'Start practice' }).click()
  await expect(page.getByRole('heading', { name: 'Value Breakdown' })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
  const board = page.getByRole('application', { name: 'Value drawing surface' })
  const paper = await imageBox(board)
  const refBox = await page.getByRole('img', { name: 'Terracotta pitcher', exact: true }).boundingBox()
  expect(refBox!.x + refBox!.width).toBeLessThan(paper.x)
  await page.getByRole('button', { name: '3 values', exact: true }).click()
  const reference = page.getByRole('img', { name: /in three values/ })
  await expect.poll(() => reference.evaluate((el: HTMLCanvasElement) => {
    const { data } = el.getContext('2d')!.getImageData(0, 0, el.width, el.height)
    const levels = new Set<number>()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) throw new Error('Expected grayscale')
      levels.add(data[i])
    }
    return [...levels].sort((a, b) => a - b)
  })).toEqual([52, 138, 222])
  const canvas = board.locator('.ink-layer')
  async function mark(y: number) {
    const at = paper.y + y * paper.height
    await page.mouse.move(paper.x + paper.width * 0.25, at)
    await page.mouse.down()
    await page.mouse.move(paper.x + paper.width * 0.75, at, { steps: 10 })
    await page.mouse.up()
  }
  for (const [index, tone] of ['light', 'middle', 'dark'].entries()) {
    await page.getByRole('button', { name: new RegExp('^' + tone + '$', 'i') }).click()
    await mark(0.25 + index * 0.25)
  }
  await expect(page.locator('.local-indicator')).toHaveText('Saved on this device')
  // The surface paints the committed outline on the next animation frame.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const painted = await pixels(canvas)
  await page.getByRole('button', { name: 'Eraser', exact: true }).click()
  await mark(0.75)
  await expect.poll(() => pixels(canvas)).toBeLessThan(painted)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => pixels(canvas)).toBe(painted)
  await expect(page.locator('.local-indicator')).toHaveText('Saved on this device')
  await page.reload()
  await expect(reference).toBeVisible()
  await expect.poll(() => pixels(canvas)).toBe(painted)
  await openBackup(page)
  const path = await downloadedFile(page, 'Download backup')
  const fresh = await browser.newContext({ baseURL: page.url(), viewport: { width: 820, height: 1180 } })
  try {
    const restored = await fresh.newPage()
    await restored.goto('/')
    await restoreFile(restored, path)
    await expect(restored.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled()
    await restored.getByRole('button', { name: 'Original', exact: true }).click()
    await restored.getByRole('button', { name: 'Finish value study' }).click()
    const saved = await sessionReady(restored)
    expect(saved.config.mode).toBe('value')
    expect(saved.trace.map((s) => s.value)).toEqual(['light', 'middle', 'dark'])
    expect(saved.reconstruct).toHaveLength(0)
    await restored.getByRole('button', { name: 'View session history' }).click()
    await restored.getByRole('button', { name: 'Open value study' }).click()
    const ink = restored.getByRole('application', { name: 'Value drawing surface' }).locator('.ink-layer')
    await expect.poll(() => ink.evaluate((el: HTMLCanvasElement) => {
      const { data } = el.getContext('2d')!.getImageData(0, 0, el.width, el.height)
      const levels = new Set<number>()
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) levels.add(data[i])
      return [...levels].sort((a, b) => a - b)
    })).toEqual([52, 138, 222])
    await expect(restored.getByRole('button', { name: 'Try reconstruction again' })).toHaveCount(0)
  } finally {
    await fresh.close()
  }
})
