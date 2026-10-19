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
- iPhone starts with finger drawing enabled. Two-finger navigation does not
  turn a finger stroke into ink; detecting a real pen enables pen-first mode.
- Stationary finger/pen contacts are rendered as dots, including repeated
  press/release coordinates, with the same appearance in thumbnails and export.
- The circular eraser removes the touched portion of ink, not paper or imported
  backgrounds. Each gesture can be undone.

## Pages and documents

**Add content** offers three choices: **New page**, **Image**, and **Import pages**.
New page adds blank paper after the selected page. Import pages uses one picker
for PDFs or images and inserts them after the selected page as writable
backgrounds. Existing pages and handwriting are preserved.

For a small screenshot inside the current page, paste an image with Ctrl/Cmd+V
outside text fields, or use **Add content → Image → Paste from clipboard**.
Clipboard access depends on browser permission and iPadOS support.
**Choose image** provides a file-picker alternative without adding another page.

Pasted/inline images switch to **Select images** (`I`). Drag an image to move it,
drag its corner to resize proportionally, or use its size/remove controls.
Arrow keys move a focused image; Delete removes it. Image insertion, movement,
resizing and removal participate in page undo/redo. Original source images are
included in backups and PDF exports. Ink stays above inline images.
Up to 100 inline images are supported per page.

Paper style, zoom, fitting and page-navigation buttons are in **Page settings**
at the top. The writing surface has no bottom controls in the palm-rest area.
The current page indicator stays in the header. **Export PDF** is in the notebook
header. In the library, swipe a notebook's name to reveal Delete, or use the
name row's actions button. Deletion always requires confirmation.

The writing screen has no editable title field and does not allow native
Copy/Look Up callouts. Rename deliberately through **Page settings → Rename
notebook**; text selection is allowed only in that explicit dialog. Finger/palm
contacts cannot activate editor controls during pen contact or the short
post-pen guard interval; intentional Pencil, mouse and keyboard actions remain
available.

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
or app interruption. Losing pointer capture no longer ends the pen stroke:
tracking continues until release/cancellation, including events outside the
writing surface. Process termination before handling input can still lose work.

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
“Restore complete” is shown only after the local database transaction succeeds.
A failed save shows recovery actions instead of reporting a successful restore.
Choose **Import as separate copies** only when duplicates are intentional.
Duplicates created by older app versions are not deleted automatically.

Clearing browser data, storage eviction, or changing the site's origin can
remove access to notebooks. Export backups regularly. Only one tab can edit
the library at a time; there is no automatic cloud sync.

After notebook use, OpenNotes automatically requests browser persistence where
supported. Help reports whether it was granted, denied, unsupported, or failed;
there is no protection-request button. A grant reduces eviction risk but does
not protect against clearing data, uninstalling the app, or device loss.

This PWA cannot choose a default iPad installation/Files directory or
automatically overwrite files in a remembered Files folder. IndexedDB and OPFS
remain browser-managed storage. App-owned document storage requires a native
iPad build with filesystem integration, macOS/Xcode and signing.

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
