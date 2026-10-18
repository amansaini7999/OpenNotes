# User guide

[OpenNotes](../README.md) · [Installation](./INSTALLATION.md)

## Writing and navigation

- On iPad, notebooks open in a page-first, fit-width layout with thumbnails
  hidden. Laptops open with the whole page fitted and thumbnails visible.
- **Show pages** toggles thumbnails. **Hide tools** controls the writing
  toolbar independently.
- **Tool settings** contains ink colors and pen/eraser size.
- On iPad, swipe left/right with one or two fingers to turn a fitted page.
  Short, diagonal, vertical, cancelled, or pinching gestures do not turn pages.
  When zoomed beyond the viewport width, two fingers pan instead.
- Select **Pan** for explicit one-finger movement. Desktop navigation uses
  page buttons and thumbnails rather than swipe page turns.
- Palm protection is automatic on iPad and after pen detection. Touches during
  pen contact and for 700 ms afterward are ignored. Browser input policy is not
  equivalent to native hardware palm classification.
- The circular eraser removes the touched portion of ink, not paper or imported
  backgrounds. Each gesture can be undone.

## Pages and documents

**Insert pages** adds blank pages, PNG/JPEG/WebP images, or PDF pages immediately
after the selected page. Existing pages and handwriting are preserved.
Images and PDF pages become writable backgrounds.

**Notebook options** contains paper style, PDF export, editable backup, and Help.

Import limits:

- Images: 20 MB per file.
- PDFs: 30 MB and 50 pages per file.
- Batch: 50 inserted pages and 100 MB.
- Notebook: 500 pages.

A failed batch does not insert partial results. Imported pages are rasterized;
PDF export preserves appearance, not selectable source text or editable PDF
annotations. Undo/redo retains up to 50 actions per page during the session.

## Saving and backups

**Saved on this device** means an IndexedDB transaction completed. It does not
mean a file was saved to Files, Google Drive, or another external folder.
Strokes commit on release; sampled pen ink is retained on handled cancellation
or lost capture. Process termination before handling input can still lose work.

Use **Back up everything** from the library or **Editable backup** from notebook
options to export `.opennotes` files. Import them to restore or transfer notes;
existing notebooks are not overwritten.

Clearing browser data, storage eviction, or changing the site's origin can
remove access to notebooks. Export backups regularly. Only one tab can edit
the library at a time; there is no automatic cloud sync.

Handwriting recognition, typed text, lasso selection, audio recording, and
collaboration are not currently included.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Pen | `P` |
| Highlighter | `H` |
| Eraser | `E` |
| Pan | `V` |
| Undo | `Ctrl` / `Cmd` + `Z` |
| Redo | `Ctrl` / `Cmd` + `Shift` + `Z` |
