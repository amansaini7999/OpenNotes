# User guide

[OpenNotes](../README.md) · [Installation](./INSTALLATION.md)

## Organizing notebooks

Use **New folder** in the library to organize subjects, books or research areas.
Open a folder and create another folder to build a hierarchy, such as
**MBBS / Anatomy** or **UPSC / History**. New notebooks and imported PDFs go
into the current folder. The breadcrumb path navigates back up; **All notebooks**
shows every notebook, including those inside folders.

Use a folder's actions button or **Folder settings** to rename or move it.
Notebook name-row actions include **Move** alongside Delete; moving keeps the
same notebook, pages and ink rather than creating a copy.
Deleting a folder requires confirmation and moves its notebooks and immediate
subfolders up one level. It never deletes notebooks. Resolve conflicting
subfolder names at the destination before deleting.

Folders are saved on this device and included in **Back up everything**.
Restore reuses matching folder IDs, or matching names under the same parent,
without duplicating the hierarchy. Existing local folder names/locations and
notebook locations are preserved; new/restored missing notebooks use the backup
location. Old backups without folders remain supported. A workspace supports
up to 1,000 folders, with names up to 100 characters.

## Writing and navigation

- On iPad, notebooks open in a page-first, fit-width layout with thumbnails
  hidden. Laptops open with the whole page fitted and thumbnails visible.
- **Show pages** toggles thumbnails. **Hide tools** controls the writing
  toolbar independently.
- **Tool settings** contains ink colors and pen/eraser size.
- New ballpoint strokes use one continuous, gently smoothed path with steady width.
  **Tool settings → Pen style** also offers a pressure-sensitive pen. Raw points
  stay editable, and geometry is shared by canvas, thumbnails and PDF export.
  Older pressure ink is filled as one connected shape instead of rasterizing
  its individual segments separately; saved points and pressure stay unchanged.
- **Images** (the arrow, `I`) selects pasted images for moving or resizing;
  it is not a text-copy tool.
- **Laser** (`L`, also named Temporary pen) leaves a disappearing presentation
  trail. The toolbar shows its duration: **2 seconds** by default. Tool settings
  offers 1, 2, 5, 10 or 30 seconds. Older parts disappear even while the Pencil
  stays down; the remaining trail eases out during its final second. It never
  enters the saved notebook, undo history or PDF export.
- On iPad, swipe left/right with one or two fingers to turn a fitted page.
  Short, diagonal, vertical, cancelled, or pinching gestures do not turn pages.
  When zoomed beyond the viewport width, two fingers pan instead.
- Select **Pan** for explicit one-finger movement. Desktop navigation uses
  page buttons and thumbnails rather than swipe page turns.
  In vertical mode, Pan uses native finger scrolling with inertia, just like
  read mode; Pencil/mouse drags also move the document. Selecting another tool
  clears the previous gesture. On pen-first iPads, fingers still navigate while
  Pencil uses the selected pen/highlighter/eraser; tool selection does not turn
  finger navigation into drawing.
- **Page settings → Page navigation mode** switches between swipe pages and
  continuous vertical scrolling. The choice is remembered on this device.
  Vertical mode renders nearby pages only, and keeps each page's ink and undo
  history separate. Use the top zoom/fit controls to change the column size.
- **Read mode** hides tools and prevents drawing, image editing, imports,
  undo, renaming and paper changes. Navigation, zoom and PDF export remain
  available. In vertical read mode, fingers scroll naturally; choose **Edit**
  to resume writing. On iPhone in edit mode, choose Pan or use two fingers
  to scroll without drawing.
- Palm protection is automatic on iPad and after pen detection. Canvas touches during
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
If direct clipboard reading is denied or supplies no image, OpenNotes opens a
**System paste area**. This is a rich-editable image target, not a plain-text
input. Touch and hold that area and use the system **Paste**
action, or press Cmd/Ctrl+V. This deliberate field permits the native paste menu
without enabling text selection on the writing page. Copied image files and
embedded PNG/JPEG/WebP images in clipboard HTML are supported. Links, selected
text and remote image URLs are not image pixels and are not downloaded
automatically; use **Copy Image** in the source app, or Choose image.
If the browser still supplies no image pixels, the dialog reports the received
format names (not clipboard contents), so an unsupported format can be identified.

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

The writing screen suppresses browser selection and callouts across the page,
including status and notice banners. Native touch defaults on the writing
surface are blocked separately from native scrolling in read mode.
This cannot certify every iPadOS system gesture; physical-device testing is
still needed. Rename deliberately through **Page settings → Rename
notebook**; text selection is allowed only in that explicit dialog. Finger/palm
contacts that begin during pen contact cannot activate editor controls, even
if released after the Pencil. Fresh toolbar contacts after pen-up select tools
immediately, without a recovery delay. The 700 ms post-pen guard still protects
the writing surface. Intentional Pencil, mouse and keyboard actions remain
available; delayed pointer clicks do not restore a previously selected tool.

Import limits:

- Images: 20 MB per file.
- PDFs: 30 MB and **1,000 pages per file**.
- Batch: 50 files, 1,000 inserted pages and 100 MB.
- Notebook: 2,000 pages, leaving room for a book and additional notes.

A failed batch does not insert partial results. Screen previews are optimized,
but new imports retain their original PDF/image files separately. PDF export
uses the first notebook page's paper size for every page, fitting attachments
proportionally with margins and no cropping. Source PDF page content remains
vector-based, and source images retain their pixel resolution without extra
JPEG recompression. Ink is exported as vectors.

PDFs over 50 pages retain their original file and page geometry without
pre-rendering every page. Pages and visible thumbnails are decoded on demand,
with one active book decoder, one preview render at a time and a 12-preview
cache. Leaving a page cancels unnecessary preview work; closing the notebook
releases the decoder. This also works offline after app setup. Book previews
are temporary, not duplicated into the editable backup. Loading/decoding errors
are reported; the original PDF remains available for backup and vector export.

JPEG orientation and WebP conversion use lossless PNG output; conversions above
16 million pixels fail explicitly rather than silently reducing quality.
Original files and editable ink are included in `.opennotes` backups. Interactive
PDF forms, links and annotation editing are not preserved as interactive features.
Older imports that only retained a preview cannot regain lost detail; re-import
the original file to use source-quality export.

Undo/redo retains up to 50 actions per page during the session.

## Saving and backups

### If a book crashes the app

Do not uninstall OpenNotes or clear website data. Close the app and its other
tabs, then open [Recovery](https://amansaini7999.github.io/OpenNotes/?recovery=1)
in the same browser and origin as your saved notes. Installed-app storage may
be separate from a Safari tab's storage; a previous interrupted book session
also opens recovery automatically when that app reopens.

Recovery lists notebook metadata without loading original PDFs or page
previews. Download an **editable backup** of each important notebook to retain
handwriting, or download an original source file separately. Confirm the
downloads exist in Files before changing any storage settings.

**Keep ... out of library** excludes the problem notebook from normal loading
without deleting its pages, originals or annotations. You can restore it from
the recovery screen later. Normal **Back up everything** includes only visible
notebooks while exclusions are active; export excluded notebooks separately
from recovery. Close other editing windows before a recovery export.

Recovery is also entered when a large-book session did not close cleanly;
this is a precaution, not proof that data was lost. A normal library return
does not automatically reopen the book. Page-count support is not a guarantee
that every scanned PDF fits a particular device's memory.

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
| Temporary pen | `L` |
| Undo | `Ctrl` / `Cmd` + `Z` |
| Redo | `Ctrl` / `Cmd` + `Shift` + `Z` |
