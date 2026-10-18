# OpenNotes

A free, independently implemented, local-first notebook PWA for handwriting and
PDF annotation. Built with **TypeScript, React and Canvas 2D**, designed for iPad
and desktop Chrome. No account, server-side database, analytics, subscriptions,
CDN assets, or cloud service is required.

OpenNotes is not affiliated with Goodnotes and does not contain its application
code or branding. This is a usable first version, not feature parity with
Goodnotes.

## Run locally on Windows

Requires Node.js **24.11+** (tested) and npm. Internet access is needed to install
development dependencies once; normal app use is local.

```powershell
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4173** in Chrome. Use the browser's Install option to add
OpenNotes as a standalone app. Wait for the service worker to cache the build
before disconnecting; Help & install reports when offline setup is complete.

After that, writing, PDF import/export, backups and reopening work without
internet. If the local server is stopped, an already installed/cached app can
still launch offline, provided its browser data has not been cleared. Keep the
same address and port: `localhost` and `127.0.0.1` have separate storage.

Do **not** double-click `dist/index.html`. Service workers and storage
coordination require localhost or a trusted HTTPS origin.

For development, run `npm run dev`. The development server is not the production
offline app; use a production build for offline validation.

## Use on iPad without public hosting

An iPad's `localhost` refers to the iPad, not your PC. It needs a one-time visit
to your PC over **trusted HTTPS on your local Wi-Fi**, or another trusted HTTPS
address. Public internet hosting is not required.

One local setup option is [mkcert](https://github.com/FiloSottile/mkcert). Install
it separately from its official distribution, then:

```powershell
mkcert -install
New-Item -ItemType Directory -Force .local
# Replace 192.168.1.20 with your PC's LAN IP. Keep a stable/reserved IP.
mkcert -cert-file .local\tls.crt -key-file .local\tls.key localhost 127.0.0.1 192.168.1.20
$env:OPENNOTES_HTTPS = '1'
npm run preview -- --host 0.0.0.0
```

Allow access on your private network if Windows Firewall prompts. Install and
explicitly trust **only the mkcert root CA certificate** on your iPad, following
mkcert's iOS instructions. Never transfer or publish the CA private key
(`rootCA-key.pem`) or your TLS key. All files under `.local` are git-ignored.

In Safari, visit `https://192.168.1.20:4173`, then Share → Add to Home Screen.
Wait until Help & install confirms offline readiness. Close and reopen the
installed app and test in Airplane Mode. Notes belong to that iPad's browser
storage; PC notes are not automatically synced. Use editable backups to transfer
them. When finished serving HTTPS, clear the shell flag with
`Remove-Item Env:OPENNOTES_HTTPS`.

Certificate warnings must be fixed, not bypassed: an untrusted certificate or
plain HTTP LAN address does not provide a reliable secure PWA environment.

## Included

- Notebook creation, cover colors, search, rename and confirmed deletion.
- Multiple pages with dotted, ruled and plain paper.
- Pressure-sensitive pen, translucent highlighter and whole-stroke eraser.
- Page-scoped undo/redo (up to 50 actions during the current session).
- Mouse/touch/Pencil input, a Pencil-only drawing mode, two-finger pan/zoom,
  zoom controls and page fitting. Live ink is rendered imperatively, outside
  React's render loop.
- Transactional IndexedDB autosave with explicit saving/error states, backup
  recovery on write failure, and a single-writer lock to prevent concurrent tabs
  from overwriting notes.
- PDF import up to **30 MB / 50 pages** and PDF export. Imported pages are
  rasterized one at a time; exported PDFs preserve appearance, not searchable
  original text or editable PDF annotations.
- Editable `.opennotes` JSON backups, including all pages and images. Import
  creates new notebook/page identities and does not overwrite existing notes.
- Offline application and PDF worker/font/CMap/WASM assets bundled locally.
- Persistent storage request, responsive layout, keyboard shortcuts and
  accessible controls/dialogs.

## Data safety and limitations

**Local storage is not a backup.** Clearing browser data, removing the app,
changing origin, or browser storage eviction can lose notebooks. Use
**Back up everything** regularly. Persistent storage requests may be denied and
do not protect against deliberate deletion.

“Saved on this device” appears after the IndexedDB transaction completes. A
stroke is committed on pointer release; an interrupted/cancelled in-progress
stroke is discarded. The app does not promise crash-proof retention of a stroke
still being drawn. Do not close during imports/exports or while saving.

There is no cloud sync, handwriting recognition, text tool, lasso, audio
recording, collaboration, or `.goodnotes` import/export. Apple Pencil advanced
features and palm rejection depend on browser/device behavior. They are not
equivalent to native PencilKit and require physical-iPad testing.

## Development and tests

```powershell
npm test
npm run check
npm run build
# Install WebKit once if missing; Chrome tests use installed Google Chrome.
npx playwright install webkit
npm run test:e2e
```

- Unit tests cover document validation, backup identity collisions, pure eraser
  geometry, pressure widths, queued saves, image persistence and corrupt data.
- Playwright covers Chrome plus an iPad-sized WebKit configuration: handwriting
  with synthetic mouse input, undo/redo, erasing, reload persistence, offline
  startup and offline PDF operations, backup recovery, malformed input,
  concurrent-tab protection, storage failure and responsive layouts.
- Browser emulation is **not physical iPad certification**. Test Apple Pencil
  latency, palm rejection, two-finger gestures, Home Screen installation, memory
  pressure with realistic PDFs, and save/reopen in Airplane Mode on real hardware.

Latest local validation: **18 unit tests passed**, strict TypeScript and the
production build passed, and **26 browser tests passed**. Two additional WebKit
cases are intentionally skipped because pressure/multi-touch injection uses
Chromium's CDP; those cases pass in Chrome. Ink assertions inspect rendered
canvas pixels as well as persisted data. `npm audit` reported zero known
vulnerabilities at validation time.

### Modules

| Module | Responsibility |
| --- | --- |
| `src/model.ts` | Types, runtime schemas and pure document/ink functions |
| `src/storage.ts` | Serialized, atomic IndexedDB persistence; separate image records |
| `src/render.ts` | Canvas page/stroke rendering |
| `src/files.ts` | Local PDF and backup import/export |
| `src/hooks/` | Storage lifecycle, single-writer coordination, PWA lifecycle |
| `src/components/` | Library, notebook editor, drawing surface and modal UI |

No proprietary binaries, notebook samples or personal research dumps are
included in the repository.

## What REA established

Static investigation informed the choice to evaluate a browser architecture:

- The installed Windows 2.4.5.0 main assembly is managed .NET 8; member inventory
  includes WebView2 hosting types. Identity evidence:
  `ev_c5d5678d101625e0d7c510e70ae6d3c2cbece310f1f17284084e04d6f78b5f5a`.
- The supplied Android APK reports package `com.goodnotes.android.app`, version
  `1.0.32.0 (v152089)`. Its decoded manifest declares a Trusted Web Activity
  launcher and Android browser-helper components. Evidence:
  `ev_6c812880e6192be54620484848465f53bd0da1bdc49f32d106cbe9711bc5781b`.
  APK signature verification was **not performed**.
- A supplied `.goodnotes` export is a ZIP containing notebook/search data,
  attachments, a thumbnail and `.pb` index/schema files. Evidence:
  `ev_d31bcd1cd8b343ea11109d608b64e7083ce12148a6ffd347b2d35e8aa83f8fbb`.
  Protobuf-like filenames do not establish the complete format.

These observations do not recover the native iPad implementation, establish
handwriting algorithms, or prove feature equivalence. OpenNotes' renderer,
storage schema and UI are independent design choices. Original evidence is
retained outside the repository in the development session; the supplied
installers/APK/ZIP/sample were removed from the workspace as requested.

## License

MIT; see [LICENSE](./LICENSE). Bundled dependencies retain their own licenses.