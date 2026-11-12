# Images and GIFs in Fillin

Available in the prepared 0.2.0 release. Your originals stay in this browser's local extension storage. Export a full ZIP backup before removing the extension or clearing its data.

## Save and try

1. Open Fillin and choose **Image / GIF** (the button is labelled **Create image or GIF** for assistive technology).
2. Drop one PNG, JPEG or GIF, or use **Choose file**. Add a unique shortcut such as `/setup`, optional comma-separated tags and a caption. Add an image description for instructional images.
3. Choose **Save and try**. In the practice field, type `/setup` and press **Ctrl + Space** (Control on Mac too).
4. Review the image and caption. Choose the insert action to confirm, or Cancel/Escape to keep your text unchanged. GIF previews start still; **Play GIF** lets you inspect animation. With reduced motion enabled, inserting a still is the default choice; your saved GIF stays animated.

The editor is a separate tab, so opening a webpage does not discard an unsaved popup draft. Save before leaving; closing a dirty editor asks before discarding it.

## Use on a webpage

Type the saved shortcut and press Ctrl + Space, choose it from the command palette, or use optional cursor suggestions. A visual snippet always opens a confirmation preview.

Native rich-text fields support confirmed image and literal-caption insertion, with the caret after the result and native undo. Check your completed message before sending it. Media insertion does not add text keystroke savings.

Plain text boxes cannot contain an image. Google Docs, Gmail, Notion, known managed editors and chat applications offer manual options; direct media sending or persistence in these apps is not verified:

- **Download original** requests the original file download for attaching in the destination. It preserves GIF animation.
- **Copy image** copies a static image after the clipboard write succeeds. JPEG is converted to PNG for copying.
- **Copy still image** copies the GIF's static poster; download the original to keep animation.
- **Copy caption** copies literal text. Copying happens only when requested and never automatically after insertion.

Cancel, an edited/removed shortcut, a changed original field, navigation or a newly blocked site invalidates the preview. Retry from the original field when needed. Fillin does not preview media in protected, password, OTP, read-only or disabled fields. A page can observe media you explicitly preview or insert there.

## Back up and restore

With media in your library, **Export** creates a full `fillin-backup-YYYY-MM-DD.zip` containing all shortcuts and original files. **Backup options** also offers full ZIP export and a clearly labelled text-only JSON export, which excludes media. Keep the full ZIP somewhere safe.

Use **Import** to select the ZIP. Fillin validates every file before changing your library. Review counts and matching shortcuts; existing shortcuts are kept by default. Enable **Replace matching shortcuts** only when you want backup metadata to replace them. If another window edits the library during review, review it again.

Use **Repair damaged matching originals** to recover missing/damaged files from a verified backup while keeping current captions and tags. Replacement of shortcut metadata is a separate choice. A failed restore preserves the existing library and can be retried. Full export fails if an original is unavailable, so an incomplete ZIP is never presented as a complete backup.

Legacy text JSON remains accepted. Old text-only Fillin versions cannot restore a visual ZIP; use 0.2.0 or later. Do not downgrade a media library without first exporting a full backup.

## Limits and exclusions

- PNG, JPEG or GIF, one file per shortcut; no SVG, video, remote links or uploaded HTML.
- Original at most 10 MiB; total referenced originals at most 50 MiB. Identical files share storage.
- At most 8,192 pixels per axis and 12 million pixels per frame; GIFs at most 300 frames and 200 million cumulative frame pixels.
- Caption at most 2,000 characters; image description at most 300. Captions are literal; template fields do not run in media captions.
- Backup at most 80 MiB compressed and expanded, with a 2 MiB manifest limit. Actual available browser storage may be lower.

Search matches shortcuts, tags, captions, descriptions and filenames. Library thumbnails remain static and load when visible. If a file is unavailable, open its editor to replace it or restore a verified full backup; the shortcut remains in your library.
