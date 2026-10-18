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

For a small screenshot inside the current page, paste an image with Ctrl/Cmd+V
outside text fields, or use **Insert pages → Paste image**. Clipboard access
depends on browser permission and iPadOS support. **Image on this page** provides
a file-picker alternative without adding another notebook page.

Pasted/inline images switch to **Select images** (`I`). Drag an image to move it,
drag its corner to resize proportionally, or use its size/remove controls.
Arrow keys move a focused image; Delete removes it. Image insertion, movement,
resizing and removal participate in page undo/redo. Original source images are
included in backups and PDF exports. Ink stays above inline images.
Up to 100 inline images are supported per page.

Paper style is available in the bottom bar. **Export PDF** is in the notebook
header. In the library, swipe a notebook's name to reveal Delete, or use the
name row's actions button. Deletion always requires confirmation.

Import limits:

- Images: 20 MB per file.
- PDFs: 30 MB and 50 pages per file.
- Batch: 50 inserted pages and 100 MB.
- Notebook: 500 pages.

A failed batch does not insert partial results. Screen previews are optimized,
but new imports retain their original PDF/image files separately. PDF export
uses the first notebook page's paper size for every page, fitting attachments
proportionally with margins and no cropping. Source PDF page content remains
vector-based, and source images retain their pixel resolution without extra
JPEG recompression. Ink is exported as vectors.

JPEG orientation and WebP conversion use lossless PNG output; conversions above
16 million pixels fail explicitly rather than silently reducing quality.
Original files and editable ink are included in `.opennotes` backups. Interactive
PDF forms, links and annotation editing are not preserved as interactive features.
Older imports that only retained a preview cannot regain lost detail; re-import
the original file to use source-quality export.

Undo/redo retains up to 50 actions per page during the session.

## Saving and backups

**Saved on this device** means an IndexedDB transaction completed. It does not
mean a file was saved to Files, Google Drive, or another external folder.
Strokes commit on release; sampled pen ink is retained on handled cancellation
or lost capture. Process termination before handling input can still lose work.

Use **Back up everything** from the library to export `.opennotes` files.
Import shows a restore summary before applying changes. Stable notebook IDs and
SHA-256 content checks skip identical notebooks, replace matching notebooks only
when the backup is newer, and retain newer local copies. Restoring an old
two-notebook backup after deleting one and editing the other restores the
missing notebook and keeps the newer survivor; it should not create a third.

If timestamps match but contents differ, or an older import regenerated IDs
and a name/shared-ink match suggests an existing notebook, restore requires a
choice: keep local, replace the uniquely matched version, or explicitly import
a separate copy. A name match alone never permits an automatic overwrite or
copy. Confirmed legacy matches remember an ID alias for later restores.
Choose **Import as separate copies** only when duplicates are intentional.
Duplicates created by older app versions are not deleted automatically.

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
| Select images | `I` |
| Undo | `Ctrl` / `Cmd` + `Z` |
| Redo | `Ctrl` / `Cmd` + `Shift` + `Z` |
