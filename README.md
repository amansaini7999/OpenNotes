<div align="center">

# OpenNotes

### A little room to think.

**An open-source notebook for handwriting, sketches, and PDF annotation.**

Free to use. Yours to build on. Your notes stay on your device.

[![License: MIT](https://img.shields.io/badge/License-MIT-28594e.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232a?logo=react&logoColor=61DAFB)](https://react.dev/)
[![Offline-first PWA](https://img.shields.io/badge/PWA-Offline--first-28594e)](#offline-by-design)

[Open OpenNotes](https://amansaini7999.github.io/OpenNotes/) · [Get started](#get-started) · [Features](#features) · [Contribute](#contributing)

</div>

---

OpenNotes gives your ideas a place to grow: jot down a thought, sketch a plan,
or mark up a PDF. Install it as a web app and keep working offline.
No account, subscription, or cloud service required.

## Features

- **Write naturally** — pressure-sensitive ink, a translucent highlighter,
  an adjustable circular eraser that removes only the touched ink, and undo/redo.
- **Make it yours** — named notebooks, colorful covers, multiple pages, and
  dotted, ruled, or plain paper.
- **Bring your documents** — import PDFs, annotate their pages, and export
  your work as a PDF.
- **Move around freely** — pan, zoom, fit a page to the screen, and navigate
  with two fingers while automatic palm protection keeps touch out of your ink.
- **Keep ownership** — local autosave, editable `.opennotes` backups, and
  restore/import without overwriting existing notebooks.
- **Work offline** — application assets and PDF resources are cached locally.
  No external fonts, CDNs, or runtime API calls.
- **Use your browser** — responsive layouts for desktop and tablet, keyboard
  shortcuts, and installation to your Home Screen or desktop.

## Get started

**Use the app:** visit **https://amansaini7999.github.io/OpenNotes/**. On iPad,
open it in Safari and choose **Share → Add to Home Screen**. No account,
certificate setup, or local server is needed. Wait for **Help & install** to
confirm offline readiness before disconnecting.

The **Install app** button at the top of the page shows step-by-step iPad and
desktop instructions. iPad installation uses the browser's Home Screen action;
there is no app package to download.

The website delivers application files; your notebooks remain in your browser.
GitHub Pages may log normal website requests, including IP addresses.

### Run your own copy

### Requirements

- Node.js **24.11 or newer in the 24.x line** (tested).
- npm.
- A current browser with IndexedDB, service workers, and Web Locks.
  Automated browser tests cover Chrome and an iPad-sized WebKit configuration.

```powershell
git clone https://github.com/amansaini7999/OpenNotes.git
Set-Location OpenNotes
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4173** in Chrome and create your first notebook.
Use Chrome's Install option to open OpenNotes as a standalone app.

Internet access is needed to download dependencies initially, not for everyday
writing. Keep the same address and port: `localhost` and `127.0.0.1` are
different storage locations.

## Offline by design

OpenNotes stores notebooks in **IndexedDB on your device**. A service worker
caches the production app, including PDF processing resources, so writing,
backups, and PDF import/export work offline after the initial load.

1. Open the production app from localhost or trusted HTTPS.
2. Check **Help & install** for confirmation that offline setup is complete.
3. Install the app, then test reopening it without a network connection.

Once cached, the app can reopen without the local server running, provided
the browser retains its application data. No public hosting is required for
local desktop use.

> **Keep a backup.** Local storage is not a backup service. Clearing browser
> data, changing the app's address, removing the app, or storage eviction can
> remove notes. Use **Back up everything** regularly and save the exported
> `.opennotes` file somewhere safe.

The save indicator confirms when a local transaction completes. Strokes are
saved after pointer release. If pen input is cancelled or capture is lost,
already sampled pen ink is committed without adding unreliable cancellation
coordinates. Cancelled touch/mouse strokes and eraser gestures are discarded.
This does not guarantee recovery if the process closes before input is handled.
Storage failures are shown explicitly, with retry and backup recovery options.
Only one tab may edit the library at a time.

## Use on iPad

Open **https://amansaini7999.github.io/OpenNotes/** in Safari, then choose
**Share → Add to Home Screen**. Wait for offline setup to complete before
disconnecting.

Alternatively, serve it from your own PC over local Wi-Fi; public hosting is optional.
The initial setup still requires a secure connection. An iPad's `localhost`
points to the iPad itself, not your PC.

<details>
<summary><strong>Local Wi-Fi setup from Windows</strong></summary>

Install [mkcert](https://github.com/FiloSottile/mkcert) from its official
distribution, then run:

```powershell
mkcert -install
New-Item -ItemType Directory -Force .local
# Replace this example IP with your PC's LAN IP.
mkcert -cert-file .local\tls.crt -key-file .local\tls.key localhost 127.0.0.1 192.168.1.20
$env:OPENNOTES_HTTPS = '1'
npm run preview -- --host 0.0.0.0
```

- Keep a stable or reserved LAN IP and allow access on your private network
  if Windows Firewall prompts.
- Follow mkcert's iOS instructions to install and explicitly trust its root
  CA **certificate** on your iPad.
- Never transfer or publish `rootCA-key.pem` or your TLS private key.
  The project's `.local` directory is git-ignored.
- Visit `https://192.168.1.20:4173` in Safari and add it to the Home Screen.
- Fix certificate warnings rather than bypassing them; plain HTTP LAN access
  is not a reliable secure PWA setup.
- To return your shell to normal HTTP mode, run
  `Remove-Item Env:OPENNOTES_HTTPS`.

</details>

Each device keeps its own notebooks. Transfer them using editable backups;
there is no automatic cross-device sync.

**Device testing:** real Apple Pencil responsiveness, palm rejection, Home
Screen behavior, and large-document performance still need physical-iPad
validation. Browser emulation does not establish hardware compatibility.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Pen | `P` |
| Highlighter | `H` |
| Eraser | `E` |
| Pan | `V` |
| Undo | `Ctrl` / `Cmd` + `Z` |
| Redo | `Ctrl` / `Cmd` + `Shift` + `Z` |

Palm protection is automatic on iPad and turns on when a pen is first detected;
there is no Pencil-only checkbox to configure.
One touch does not draw or pan in this mode; use two fingers to navigate
or explicitly select the Pan tool for one-finger navigation. Touches during pen
contact and for 700 ms afterward are ignored, reducing palm interference.
This is an app-level input policy, not native hardware palm classification.

The eraser previews changes as you move and cuts only the portion of ink under
its circular tip, including highlights. Adjust **Eraser size** in the toolbar.
An eraser gesture is one undo action. Page templates and PDF backgrounds are
not erased.

## Current scope

- PDF import supports files up to **30 MB and 50 pages**.
- Imported PDF pages are rasterized. Export preserves their appearance, not
  selectable source text or editable PDF annotations.
- Undo/redo retains up to 50 actions per page during the current session.
- Editable backups use OpenNotes' own `.opennotes` format.
- Cloud sync, handwriting recognition, typed text, lasso selection, audio
  recording, and collaboration are not included yet.

## Development

```powershell
npm run dev
```

Use a production build, rather than the development server, to validate
offline installation. Opening `dist/index.html` directly does not provide
the secure context required by the app.

### Automatic publishing

Pull requests run unit tests, a production build, and Chrome/WebKit browser
tests. Every push or merge to `main` runs the same checks and deploys the passing
build to **https://amansaini7999.github.io/OpenNotes/** through GitHub Actions.
Failed validation prevents deployment; pull requests never deploy the live site.

The Pages build uses `OPENNOTES_BASE_PATH=/OpenNotes/`. Local builds default to
`/`. Keep the public origin stable so users retain access to their local notes.
Existing installed apps show an update notice when a new version is available;
finish writing, wait for a saved state, then close all app windows and reopen.

### Project structure

| Location | Purpose |
| --- | --- |
| [src/model.ts](./src/model.ts) | Types, runtime validation, and pure document/ink functions |
| [src/storage.ts](./src/storage.ts) | Atomic, serialized IndexedDB persistence |
| [src/render.ts](./src/render.ts) | Canvas page and stroke rendering |
| [src/files.ts](./src/files.ts) | PDF and backup import/export |
| [src/hooks/](./src/hooks/) | Storage coordination and PWA lifecycle |
| [src/components/](./src/components/) | Notebook library, editor, drawing surface, and dialogs |
| [tests/](./tests/) | Browser workflow tests |

React manages the interface; live ink rendering stays outside React's render
loop. Document transformations and geometry use pure functions, with
persistence and file operations kept in separate modules.

The drawing surface retains its live canvas between saved strokes and renders
new pen segments incrementally. The app follows the browser's visible viewport
height, with notebook scrolling kept inside the workspace rather than the page.

### Run checks

```powershell
npm test
npm run check
npm run build
# One-time download for WebKit tests; Chrome tests use installed Google Chrome.
npx playwright install webkit
npm run test:e2e
```

Tests cover ink geometry and rendered pixels, pressure input, multi-touch zoom,
document validation, persistence, offline startup, offline PDF operations,
backup recovery, storage failures, concurrent tabs, installation guidance,
viewport-height changes, interrupted pen input, rapid strokes, and responsive layouts.
Chromium-specific input-injection tests are intentionally skipped in WebKit.

## Contributing

Contributions are welcome: code, documentation, accessibility improvements,
bug reports, and real-device testing all help.

1. [Open an issue](https://github.com/amansaini7999/OpenNotes/issues) to report
   a bug or discuss a substantial change.
2. Fork the repository and create a focused branch.
3. Keep TypeScript types strict, separate side effects from document logic,
   and add tests for changed behavior.
4. Run the checks above and open a pull request describing the change.

For drawing or offline bugs, include your browser version, device, reproduction
steps, and whether the app was running in a tab or installed mode. Do not
include private notebooks or personal information.

## License

OpenNotes is open source under the **[MIT License](./LICENSE)**.
Use it, modify it, and share it. Dependencies retain their respective licenses.
