import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MediaSnippet } from '@fillin/shared';
import type { AssetRecord } from '../storage/MediaAssetRepository';
import { mediaSnippetService } from '../services/media';
import {
  capturePracticeTarget,
  insertPracticeMedia,
  type PracticeTarget,
} from './PracticeInsertion';
import { MediaPreviewDialog } from './MediaPreviewDialog';

export function MediaPractice({ snippet }: { snippet: MediaSnippet }) {
  const editor = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<{
    target: PracticeTarget;
    asset: AssetRecord;
  }>();
  const active = useRef<PracticeTarget | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const generation = useRef(0);
  const returnFocus = useRef(false);
  useLayoutEffect(() => {
    // A keyboard user may open the dialog from its preview button. Restore the
    // typing field after the dialog restores that original control on unmount.
    if (!session && returnFocus.current) {
      returnFocus.current = false;
      editor.current?.focus({ preventScroll: true });
    }
  });
  const close = () => {
    const target = active.current;
    if (target?.bookmark.isValid()) target.bookmark.restore();
    target?.bookmark.dispose();
    active.current = null;
    returnFocus.current = true;
    setSession(undefined);
    setBusy(false);
    generation.current++;
  };
  useEffect(
    () => () => {
      generation.current++;
      active.current?.bookmark.dispose();
      active.current = null;
    },
    [snippet.id, snippet.updatedAt]
  );
  const preview = async () => {
    if (active.current) return;
    setError('');
    setNotice('');
    const target = editor.current && capturePracticeTarget(editor.current, snippet);
    if (!target) {
      setError(`Type ${snippet.trigger}, place the cursor just after it, then preview.`);
      editor.current?.focus();
      return;
    }
    active.current = target;
    const request = ++generation.current;
    setBusy(true);
    try {
      const asset = await mediaSnippetService.readSelected(snippet);
      if (request !== generation.current) return;
      if (!target.bookmark.isValid())
        throw new Error('The practice field changed. Try your shortcut again.');
      setSession({ target, asset });
    } catch (error) {
      if (request === generation.current) {
        close();
        setError(error instanceof Error ? error.message : 'Could not load the image.');
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  return (
    <section className="media-practice" aria-labelledby="media-practice-heading">
      <div className="media-section-heading">
        <div>
          <span className="media-eyebrow">02 / TRY IT</span>
          <h2 id="media-practice-heading">A small shortcut. Your whole image.</h2>
        </div>
        <span className="media-local-badge">Practice only</span>
      </div>
      <p>
        Type <kbd>{snippet.trigger}</kbd>, then press <kbd>Ctrl + Space</kbd> or choose Preview
        shortcut.
      </p>
      <label id="practice-label">Practice field</label>
      <div
        ref={editor}
        role="textbox"
        aria-labelledby="practice-label"
        aria-multiline="true"
        className="media-practice-field"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onKeyDown={(event) => {
          if (event.ctrlKey && event.code === 'Space' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void preview();
          }
        }}
      />
      <div className="media-practice-actions">
        <button
          type="button"
          className="popup-primary"
          disabled={busy || !!session}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void preview()}
        >
          {busy ? 'Loading preview…' : 'Preview shortcut'}
        </button>
        <button
          type="button"
          className="popup-secondary"
          disabled={busy || !!session}
          onClick={() => {
            if (editor.current) {
              editor.current.replaceChildren();
              editor.current.focus();
            }
            setNotice('');
            setError('');
          }}
        >
          Reset field
        </button>
      </div>
      <p className="media-help">
        Practice stays in this tab and does not change your usage statistics. Supported rich-text
        fields can insert images on websites; other editors offer copy or download options.
      </p>
      {error && (
        <p role="alert" className="media-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="media-success">
          {notice}
        </p>
      )}
      {session && (
        <MediaPreviewDialog
          snippet={snippet}
          asset={session.asset}
          onClose={close}
          onConfirm={async (options) => {
            await mediaSnippetService.readSelected(snippet);
            await insertPracticeMedia(session.target, snippet, session.asset, options);
            close();
            setNotice(
              snippet.mime === 'image/gif' && !options.animate
                ? 'Inserted a still preview in practice. Your saved GIF is unchanged.'
                : 'Inserted in practice. Keep typing, or undo to try again.'
            );
          }}
        />
      )}
    </section>
  );
}
