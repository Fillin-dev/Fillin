import React, { useRef, useState } from 'react';
import type { MediaSnippet } from '@fillin/shared';
import type { AssetRecord } from '../storage/MediaAssetRepository';
import { Dialog } from '../components/Dialog';
import { MediaPreview } from './MediaPreview';

export function MediaPreviewDialog({
  snippet,
  asset,
  onClose,
  onConfirm,
}: {
  snippet: MediaSnippet;
  asset: AssetRecord;
  onClose: () => void;
  onConfirm: (options: { caption: boolean; animate: boolean }) => Promise<void>;
}) {
  const [caption, setCaption] = useState(Boolean(snippet.caption));
  const [animate, setAnimate] = useState(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submitting = useRef(false);
  const close = () => {
    if (!submitting.current) onClose();
  };
  return (
    <Dialog titleId="media-preview-heading" onClose={close}>
      <div className="media-preview-dialog">
        <span className="media-eyebrow">PREVIEW SHORTCUT</span>
        <h2 id="media-preview-heading">{snippet.trigger}</h2>
        <MediaPreview
          original={asset.original}
          thumbnail={asset.thumbnail}
          animated={snippet.mime === 'image/gif'}
          alt={snippet.alt}
        />
        {snippet.caption && (
          <>
            <label className="media-check">
              <input
                type="checkbox"
                checked={caption}
                disabled={busy}
                onChange={(event) => setCaption(event.target.checked)}
              />
              Include caption
            </label>
            {caption && <p className="media-caption-preview">{snippet.caption}</p>}
          </>
        )}
        {snippet.mime === 'image/gif' && (
          <label className="media-check">
            <input
              type="checkbox"
              checked={animate}
              disabled={busy}
              onChange={(event) => setAnimate(event.target.checked)}
            />
            Keep animation when inserting
          </label>
        )}
        <p className="media-help">This inserts into your Fillin practice field.</p>
        {error && (
          <p role="alert" className="media-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="popup-secondary"
            data-dialog-initial
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="button"
            className="popup-primary"
            disabled={busy}
            onClick={async () => {
              if (submitting.current) return;
              submitting.current = true;
              setBusy(true);
              setError('');
              try {
                await onConfirm({ caption, animate });
              } catch (error) {
                setError(error instanceof Error ? error.message : 'Could not insert this image.');
              } finally {
                submitting.current = false;
                setBusy(false);
              }
            }}
          >
            {busy
              ? 'Inserting…'
              : snippet.mime === 'image/gif' && !animate
                ? 'Insert still preview'
                : caption
                  ? 'Insert image + caption'
                  : 'Insert image'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
