import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Dialog } from './Dialog';

interface Props {
  trigger: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  media?: boolean;
}

export function ConfirmDialog({ trigger, onConfirm, onCancel, media = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (!busy) onCancel();
  };
  return (
    <Dialog titleId="delete-heading" onClose={close}>
      <div className="delete-dialog-body">
        <span className="delete-dialog-icon">
          <Trash2 size={23} aria-hidden="true" />
        </span>
        <h2 id="delete-heading">Delete snippet?</h2>
        <p>
          <strong className="dialog-trigger">{trigger}</strong> will be permanently removed.{' '}
          {media
            ? 'Export a full ZIP backup from your library first if you want to keep this snippet and its original image.'
            : 'Export a backup first if you want to keep a copy.'}
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button className="popup-secondary" data-dialog-initial disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            className="popup-danger"
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : 'Could not delete this snippet. Try again.'
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
        <p className="dialog-footnote">Press Esc to go back.</p>
      </div>
    </Dialog>
  );
}
