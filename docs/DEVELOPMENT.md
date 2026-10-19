# Development

[OpenNotes](../README.md) · [Installation](./INSTALLATION.md) · [User guide](./USER_GUIDE.md)

## Start developing

Use Node.js 24.11+ in the 24.x line and npm.

```powershell
npm ci
npm run dev
```

For offline and installation testing, use a production build:

```powershell
npm run build
npm start
```

## Architecture

OpenNotes uses TypeScript, React, and Canvas 2D. React manages the interface;
live ink is rendered imperatively. Document transformations and geometry are
separate from storage, file processing, and browser lifecycle effects.

| Location | Responsibility |
| --- | --- |
| [model.ts](../src/model.ts) | Document types, validation, and transformations |
| [storage.ts](../src/storage.ts) | Atomic IndexedDB persistence and serialized writes |
| [render.ts](../src/render.ts) | Canvas rendering |
| [ink.ts](../src/ink.ts) | Shared smooth stroke outlines using MIT-licensed perfect-freehand |
| [temporary.ts](../src/temporary.ts) | Nonpersistent presentation stroke timing |
| [eraser.ts](../src/eraser.ts) | Partial ink erasing |
| [files.ts](../src/files.ts) | Local PDF/image import and file export |
| [assets.ts](../src/assets.ts) | Original source bytes, MIME detection and JPEG orientation |
| [pdf.ts](../src/pdf.ts) | Uniform-size, vector/source-preserving PDF export |
| [navigation.ts](../src/navigation.ts) | Device defaults and page-turn recognition |
| [images.ts](../src/images.ts) | Proportional inline-image placement and bounds |
| [backup.ts](../src/backup.ts) | SHA-256 content identity and reviewed backup restore |
| [persistence.ts](../src/persistence.ts) | Actual browser persistence capability/grant checks |
| [hooks/](../src/hooks/) | Storage coordination, PWA and viewport lifecycle |
| [components/](../src/components/) | Library, editor, writing surface, and dialogs |
| [tests/](../tests/) | Browser workflows |

Only changed page records are written; page previews and original source assets
are stored separately. Database version 3 adds a folder metadata store and
upgrades version 1/2 libraries without clearing notes or original assets.
Folders and notebook moves commit in the same transaction. Backups default
missing folder metadata to an empty hierarchy, preserving old backup support.
Each imported PDF is stored once and referenced by its pages.
PDF files support 1,000 pages; notebooks support 2,000 pages. Books over 50 pages
store geometry and original bytes rather than eager raster previews.
The editor decodes only visible book pages/thumbnails, serializes rendering,
cancels obsolete requests, caches 12 previews and releases its decoder on exit.
Startup uses bulk store reads rather than issuing thousands of per-page requests.
The current startup path still loads all notebook data, so lazy loading remains
an area for improvement with large libraries.

## Validation

```powershell
npm test
npm run check
npm run build
# One-time WebKit download; Chrome tests use installed Google Chrome.
npx playwright install webkit
npm run test:e2e
```

Tests cover document and geometry functions, storage failures and recovery,
rendered ink, offline workflows, imports/exports, device-specific layouts,
touch navigation, and independent panels. CDP input tests run only in Chromium;
WebKit emulation is not physical Apple Pencil certification. A focused iPhone
WebKit project exercises native touchscreen contacts and persistence behavior;
Chrome/CDP regressions exercise real pointer-capture loss and continued pen
samples rather than treating capture loss as a completed stroke.

To test a project-relative build:

```powershell
$env:OPENNOTES_BASE_PATH = '/OpenNotes/'
npm run build
npm run test:e2e
Remove-Item Env:OPENNOTES_BASE_PATH
```

`OPENNOTES_TEST_PORT` can select an isolated preview port for browser tests.
Local builds otherwise default to `/`.

## Deployment

Pull requests run unit tests, a production build, and Chrome/WebKit browser
tests. Passing builds on `main` deploy to
**https://amansaini7999.github.io/OpenNotes/** through GitHub Actions.
Pull requests do not deploy the production site.

The Pages build uses `OPENNOTES_BASE_PATH=/OpenNotes/`. Keep the public origin
stable: browser data does not automatically transfer when an address changes.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the issue/PR workflow,
validation expectations and safe bug reporting.
[AGENTS.md](../AGENTS.md) provides repository instructions for coding assistants.
Report vulnerabilities privately following [SECURITY.md](../SECURITY.md).
