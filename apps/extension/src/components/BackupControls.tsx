import React, { useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { Snippet } from '@fillin/shared';
import { backupService, exportFullBackup, prepareBackup } from '../backup';
import type { PreparedBackup } from '../backup/codec';
import type { ImportPreview } from '../backup/BackupService';
import { snippetService } from '../services';
import { exportBackup } from '../utils/exportBackup';
import { Dialog } from './Dialog';

export function BackupControls({
  snippets,
  onNotice,
  onChanged,
  onLegacyImport,
  disabled = false,
}: {
  snippets: Snippet[];
  onNotice: (text: string, error?: boolean) => void;
  onChanged?: () => void | Promise<void>;
  disabled?: boolean;
  onLegacyImport?: (
    data: unknown[]
  ) => Promise<{ imported: number; updated: number; skipped: number }>;
}) {
  const [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false),
    [options, setOptions] = useState(false);
  const [pending, setPending] = useState<{ backup: PreparedBackup; preview: ImportPreview }>();
  const [replace, setReplace] = useState(false),
    [error, setError] = useState('');
  const [repair, setRepair] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    abort = useRef<AbortController>();
  const active = useRef(true),
    action = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      abort.current?.abort();
    };
  }, []);
  const hasMedia = snippets.some((snippet) => snippet.kind === 'media');
  const report = (result: { imported: number; updated: number; skipped: number }) =>
    onNotice(`Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}.`);
  const exporting = async (format: 'auto' | 'zip' | 'json' = 'auto') => {
    if (action.current || disabled) return;
    action.current = true;
    setBusy(true);
    setOptions(false);
    const controller = new AbortController();
    abort.current = controller;
    onNotice('Preparing your backup…');
    try {
      const latest = await snippetService.getSnippets();
      if (
        format === 'zip' ||
        (format === 'auto' && latest.some((snippet) => snippet.kind === 'media'))
      )
        await exportFullBackup(controller.signal);
      else {
        if (controller.signal.aborted) throw new Error('Backup cancelled.');
        exportBackup(latest.filter((snippet) => snippet.kind !== 'media'));
      }
      if (active.current)
        onNotice(
          format === 'json' && latest.some((snippet) => snippet.kind === 'media')
            ? 'Text-only JSON download started. Images are excluded.'
            : 'Backup download started. Check your Downloads folder.'
        );
    } catch (error) {
      if (active.current)
        onNotice(error instanceof Error ? error.message : 'Could not export this backup.', true);
    } finally {
      action.current = false;
      if (active.current) setBusy(false);
    }
  };
  const importing = async (selected: File) => {
    if (action.current || disabled) return;
    action.current = true;
    setBusy(true);
    setError('');
    setReplace(false);
    setRepair(false);
    const controller = new AbortController();
    abort.current = controller;
    onNotice('Checking backup files before import…');
    try {
      const backup = await prepareBackup(selected, controller.signal);
      const preview = await backupService.preview(backup);
      if (!active.current || controller.signal.aborted) return;
      // Preserve the original one-click text restore when nothing conflicts.
      if (backup.format === 'json' && !preview.conflicts.length && onLegacyImport) {
        report(await backupService.apply(backup, preview, false, controller.signal));
        await onChanged?.();
      } else setPending({ backup, preview });
    } catch (error) {
      if (active.current)
        onNotice(error instanceof Error ? error.message : 'Could not open this backup.', true);
    } finally {
      action.current = false;
      if (active.current) setBusy(false);
    }
  };
  const commit = async () => {
    if (!pending || action.current) return;
    action.current = true;
    setApplying(true);
    setError('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await backupService.apply(
        pending.backup,
        pending.preview,
        replace,
        controller.signal,
        repair
      );
      if (active.current) {
        setPending(undefined);
        report(result);
        await onChanged?.();
      }
    } catch (error) {
      if (active.current)
        setError(error instanceof Error ? error.message : 'Could not restore this backup.');
    } finally {
      action.current = false;
      if (active.current) setApplying(false);
    }
  };
  return (
    <>
      <input
        ref={file}
        hidden
        type="file"
        accept=".json,.zip,application/json,application/zip"
        aria-label="Choose snippet backup"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = '';
          if (selected) void importing(selected);
        }}
      />
      <button
        className="tool-button"
        type="button"
        disabled={busy || disabled}
        title="Import snippets"
        aria-label={hasMedia ? 'Import backup' : 'Import snippets from JSON'}
        onClick={() => file.current?.click()}
      >
        <Upload size={15} aria-hidden="true" />
        <span>Import</span>
      </button>
      <button
        className="tool-button"
        type="button"
        disabled={busy || disabled}
        title="Export snippets"
        aria-label={hasMedia ? 'Export full backup' : 'Export snippets to JSON'}
        onClick={() => void exporting()}
      >
        <Download size={15} aria-hidden="true" />
        <span>Export</span>
      </button>
      {busy ? (
        <button
          className="icon-button"
          type="button"
          aria-label="Cancel backup"
          onClick={() => abort.current?.abort()}
        >
          ×
        </button>
      ) : (
        <button
          className="icon-button"
          type="button"
          disabled={disabled}
          aria-label="Backup options"
          onClick={() => setOptions(true)}
        >
          ⋯
        </button>
      )}
      {options && (
        <Dialog titleId="backup-options-title" onClose={() => setOptions(false)}>
          <div className="backup-dialog-body">
            <h2 id="backup-options-title">Back up your library</h2>
            <p>A full ZIP includes every saved shortcut and the original image and GIF files.</p>
            <button type="button" className="popup-primary" onClick={() => void exporting('zip')}>
              Export full backup (.zip)
            </button>
            <p>Text-only JSON excludes images and GIFs.</p>
            <button
              type="button"
              className="popup-secondary"
              onClick={() => void exporting('json')}
            >
              Export text only (.json)
            </button>
            <button
              type="button"
              className="popup-secondary"
              data-dialog-initial
              onClick={() => setOptions(false)}
            >
              Cancel
            </button>
          </div>
        </Dialog>
      )}
      {pending && (
        <Dialog
          titleId="backup-import-title"
          onClose={() => {
            if (!applying) setPending(undefined);
          }}
        >
          <div className="backup-dialog-body">
            <h2 id="backup-import-title">Review backup</h2>
            <p>
              {pending.preview.incoming} shortcuts · {pending.backup.assets.length} original image
              files
            </p>
            <p>
              {pending.preview.conflicts.length} matching shortcuts. Other existing snippets will
              stay in your library.
            </p>
            {pending.backup.assets.length > 0 && (
              <label>
                <input
                  type="checkbox"
                  checked={repair}
                  disabled={applying}
                  onChange={(event) => setRepair(event.target.checked)}
                />
                Repair damaged matching originals
              </label>
            )}
            {pending.preview.conflicts.length > 0 && (
              <>
                <p className="backup-conflicts">
                  {pending.preview.conflicts.slice(0, 8).join(', ')}
                  {pending.preview.conflicts.length > 8 ? '…' : ''}
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={replace}
                    disabled={applying}
                    onChange={(event) => setReplace(event.target.checked)}
                  />
                  Replace matching shortcuts
                </label>
                <p>
                  Unchecked keeps existing shortcuts. Check only if you want the backup versions.
                </p>
              </>
            )}
            {error && (
              <>
                <p role="alert" className="form-error">
                  {error}
                </p>
                <button
                  type="button"
                  disabled={applying}
                  className="popup-secondary"
                  onClick={async () => {
                    try {
                      const preview = await backupService.preview(pending.backup);
                      setPending({ ...pending, preview });
                      setError('');
                      setReplace(false);
                      setRepair(false);
                    } catch (error) {
                      setError(
                        error instanceof Error ? error.message : 'Could not reread the library.'
                      );
                    }
                  }}
                >
                  Review latest library
                </button>
              </>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                data-dialog-initial
                className="popup-secondary"
                disabled={applying}
                onClick={() => setPending(undefined)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="popup-primary"
                disabled={applying}
                onClick={() => void commit()}
              >
                {applying ? 'Importing…' : 'Import backup'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
