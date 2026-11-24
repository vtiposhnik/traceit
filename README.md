# Traceit

Traceit is a local-first drawing trainer. Trace a reference on the practice desk, redraw it from your tracing, and overlay the two drawings to inspect their proportions. The desk opens in Free practice with a terracotta pitcher. Choose **Change reference** to browse the library, or use the mode selector to start a timed exercise.

## Run the studio

Use Node.js 22.12 or newer and npm. The cloud environment uses Node.js 24.

```sh
npm ci
npm run dev
```

Open the address Vite prints. The default development port is 5173. To serve a production build locally, run the following commands.

```sh
npm run build
npm run preview
```

## Using the desk

1. Select a studio reference, use the **Add images** card in **My library**, or search Openverse in **Explore**. Choose Free practice or a time limit for each drawing stage.
2. Draw over the reference. **B**, **E**, and **H** select pencil, eraser, and pan. Scroll to zoom around the pointer. Hold **Space** and drag to pan. The fit button recenters the sheet. Clear can be undone.
3. Choose **Finish tracing**. The sheet moves into the traced-reference panel. That panel has its own zoom, pan, and visibility controls. On a phone, **Tracing** opens the reference overlay.
4. Draw again on the blank sheet. In comparison, drag the reconstruction, scale it from 25% to 400%, toggle individual layers, change opacity, or reveal the original. **Separate** shows both sheets at their original alignment. Pan and zoom are linked by default. Turn off **Link pan and zoom** to inspect either pane independently. Turning it on again matches the reconstruction view to the tracing. **Reset alignment** restores 100% scale, clears the overlay offset and, in Separate view, recenters both sheets at fit zoom.
5. **Finish session** confirms the save and offers another practice. Reopen a comparison from **Session history**. Completed drawings and comparison edits save to this browser. An unfinished drawing stays on the desk while navigating within the app. Reloading starts a fresh desk.

Timed challenges offer 30 seconds, 60 seconds, 2 minutes, 5 minutes, or a custom duration of 1–3600 seconds per drawing. The timer pauses for dialogs, other app screens, and hidden tabs. A deadline commits an active stroke before advancing. Comparison is untimed.

## Source map

| Directory | Responsibility |
| --- | --- |
| `src/drawing` | Pointer capture, pressure samples, stroke history, coordinate transforms, Canvas rendering, and reusable drawing surfaces. |
| `src/exercise` | The three-stage reducer, elapsed and active drawing times, timed progression, and the sheet transfer. |
| `src/library` | The typed studio manifest, local image preparation, Openverse search and import, and attribution. |
| `src/storage` | The asynchronous studio store, IndexedDB transactions, and local record identities. |
| `src/ui` | The practice desk, library, setup dialog, history, and accessible controls. |
| `src/App.tsx` | Navigation, exercise lifecycle, and automatic saving. |

Both drawing stages use the same image-shaped sheet with 1,000 logical units along its longest edge. Strokes store points, pressure, tool, and size. The drawing engine captures input outside React, caches committed paths, and paints active strokes on animation frames. Erasing affects only ink. Camera changes and review offsets are display transforms.

The session record includes a stable reference ID and metadata, both stroke sets, exercise mode, per-stage elapsed and pointer-down durations, completion time, and comparison settings. Entering comparison saves the drawings. Adjustments update the same record. An uploaded or imported image is stored with its session so removing the library entry preserves past comparisons.

## References and licensing

The four bundled still lifes in `public/studies` are original generated studio images made for this project and dedicated to the public domain under CC0 1.0. Their catalog entries and study notes live in `src/library/collection.ts`. Fonts are bundled locally. [CC0 dedication](https://creativecommons.org/publicdomain/zero/1.0/)

Uploads are decoded locally and saved as raster images, capped at 25 MB per input and 2,400 pixels on the longest stored edge. Openverse search filters openly licensed images by query and subject. Search results retain the creator, source page, license, and license URL. Import requests a CORS-readable original and can fall back to the provider thumbnail. Successful imports become local raster copies. The studio collection and uploads work independently of Openverse.

## Verification

```sh
npm run test:e2e
```

The Playwright suite runs against the production bundle on port 4174 and the React development server on port 4175. It uses the system Chromium when present. On another machine, install the Playwright browser with `npx playwright install chromium` or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a compatible executable.

The browser tests cover the free-practice flow, timed transitions during a captured stroke, undo and redo, erasing, clear confirmation, pan and zoom, adaptive dimming, comparison transforms, reload recovery, and mobile upload management. Touch cancellation and pen pressure use Chromium's simulated input. Discovery tests use controlled provider responses to exercise licensing, CORS fallback, and outages.

## Before a public launch

Deploy `dist/` on a stable HTTPS origin so returning users keep access to the same browser storage. Verify live Openverse searches, image-host CORS behavior, and rate limits on that origin. Test physical pens and touchscreens, Safari and Firefox, keyboard navigation, and screen readers. Explain local data retention and browser storage limits before users rely on the studio for long-term practice records.
