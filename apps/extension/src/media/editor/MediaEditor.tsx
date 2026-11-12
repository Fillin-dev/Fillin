import React, { useEffect, useRef, useState } from 'react';
import { MEDIA_LIMITS, type MediaSnippet, type Snippet } from '@fillin/shared';
import { snippetService } from '../../services';
import { mediaSnippetService } from '../../services/media';
import { prepareMediaInWorker } from '../prepareMediaClient';
import type { PreparedMedia } from '../prepareMedia';
import { MediaPreview } from '../MediaPreview';
import { MediaPractice } from '../MediaPractice';
import { Dialog } from '../../components/Dialog';
import { formatMediaSize } from '../formatMediaSize';
import { BackupControls } from '../../components/BackupControls';

const empty = { trigger: '', tags: '', caption: '', alt: '' };
const fieldsFor = (snippet: MediaSnippet) => ({
  trigger: snippet.trigger,
  tags: snippet.tags?.join(', ') ?? '',
  caption: snippet.caption,
  alt: snippet.alt,
});
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';
export function MediaEditor() {
  const id = useRef(new URLSearchParams(location.search).get('id'));
  const [fields, setFields] = useState(empty),
    [baseline, setBaseline] = useState(JSON.stringify(empty));
  const [library, setLibrary] = useState<Snippet[]>([]),
    [saved, setSaved] = useState<MediaSnippet>();
  const [display, setDisplay] = useState<PreparedMedia>(),
    [candidate, setCandidate] = useState<File>();
  const [filename, setFilename] = useState(''),
    [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [assetError, setAssetError] = useState('');
  const [notice, setNotice] = useState(''),
    [practice, setPractice] = useState(false),
    [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<'close' | 'reload' | null>(null);
  const [usage, setUsage] = useState('');
  const input = useRef<HTMLInputElement>(null),
    practiceSection = useRef<HTMLDivElement>(null);
  const preparation = useRef<AbortController>(),
    mutation = useRef<AbortController>();
  const active = useRef(true),
    operation = useRef(0),
    allowClose = useRef(false),
    submitting = useRef(false);
  const libraryRead = useRef(0);
  const cleanupAttempted = useRef(false);
  const dirty = JSON.stringify(fields) !== baseline || !!candidate;
  const current = saved && library.find((snippet) => snippet.id === saved.id);
  const stale = !!saved && (!current || current.updatedAt !== saved.updatedAt);
  const trigger = fields.trigger.startsWith('/') ? fields.trigger : '/' + fields.trigger;
  const duplicate = library.some(
    (snippet) => snippet.trigger === trigger && snippet.id !== saved?.id
  );
  const valid =
    /^\/[a-zA-Z0-9_-]+$/.test(trigger) && !duplicate && !!display && !stale && !loadError;
  const busy = preparing || saving;

  const refreshLibrary = async () => {
    const request = ++libraryRead.current;
    try {
      const snippets = await snippetService.getSnippets();
      if (active.current && request === libraryRead.current) {
        setLibrary(snippets);
        setLoadError('');
      }
    } catch (error) {
      if (active.current && request === libraryRead.current) setLoadError(message(error));
    }
  };
  const checkMedia = async () => {
    try {
      const report = await mediaSnippetService.reconcile();
      if (active.current) setUsage(`${formatMediaSize(report.referencedBytes)} / 50 MiB used`);
      if (active.current && !cleanupAttempted.current) {
        cleanupAttempted.current = true;
        // Collection has its own fresh metadata read/lock and 24-hour grace.
        // A failed attempt simply leaves unused files for the next visit.
        void mediaSnippetService.cleanup().catch(() => {});
      }
    } catch {
      if (active.current) setUsage('Could not check media storage. Reload the editor to retry.');
    }
  };
  const load = async () => {
    setLoading(true);
    setLoadError('');
    setAssetError('');
    setError('');
    try {
      const snippets = await snippetService.getSnippets();
      if (!active.current) return;
      setLibrary(snippets);
      if (id.current) {
        const snippet = snippets.find((snippet) => snippet.id === id.current);
        if (!snippet || snippet.kind !== 'media')
          throw new Error(
            'This image snippet was removed or is unavailable. Your other snippets have not changed.'
          );
        const next = fieldsFor(snippet);
        setFields(next);
        setBaseline(JSON.stringify(next));
        setSaved(snippet);
        setFilename(snippet.originalFilename);
        setCandidate(undefined);
        setDisplay(undefined);
        setPractice(false);
        try {
          const asset = await mediaSnippetService.readSelected(snippet);
          if (active.current) setDisplay(asset);
        } catch (error) {
          if (active.current) setAssetError(message(error));
        }
      }
      void checkMedia();
    } catch (error) {
      if (active.current) setLoadError(message(error));
    } finally {
      if (active.current) setLoading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    void load();
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'fillin_snippets' in changes) {
        void refreshLibrary();
        void checkMedia();
      }
    };
    const storage = (event: StorageEvent) => {
      if (event.key === 'fillin_snippets') {
        void refreshLibrary();
        void checkMedia();
      }
    };
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(changed);
    window.addEventListener('storage', storage);
    return () => {
      active.current = false;
      operation.current++;
      preparation.current?.abort();
      mutation.current?.abort();
      if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(changed);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!allowClose.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  useEffect(() => {
    if (practice)
      practiceSection.current?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
  }, [practice]);

  const choose = async (files: FileList | File[]) => {
    if (submitting.current) return;
    if (files.length !== 1) {
      setError('Choose one PNG, JPEG or GIF at a time.');
      return;
    }
    const file = files[0];
    preparation.current?.abort();
    const controller = new AbortController();
    preparation.current = controller;
    const request = ++operation.current;
    setPreparing(true);
    setError('');
    setNotice('');
    setDragging(false);
    try {
      const prepared = await prepareMediaInWorker(file, controller.signal);
      if (!active.current || request !== operation.current) return;
      setDisplay(prepared);
      setCandidate(file);
      setFilename(file.name);
      setAssetError('');
      setPractice(false);
    } catch (error) {
      if (active.current && request === operation.current) setError(message(error));
    } finally {
      if (active.current && request === operation.current) setPreparing(false);
    }
  };
  const save = async (tryIt: boolean) => {
    if (!valid || busy || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const tags = fields.tags
        .split(/[,\s]+/)
        .map((tag) => tag.replace(/^#/, ''))
        .filter(Boolean);
      if (tags.length > 10 || tags.some((tag) => tag.length > 32))
        throw new Error('Use up to 10 tags, each at most 32 characters.');
      const record = await mediaSnippetService.save(
        {
          trigger,
          tags: [...new Set(tags)],
          caption: fields.caption,
          alt: fields.alt,
          filename,
        },
        candidate,
        {
          id: saved?.id,
          expectedUpdatedAt: saved?.updatedAt,
          signal: controller.signal,
        }
      );
      if (!active.current) return;
      libraryRead.current++;
      id.current = record.id;
      history.replaceState(null, '', '?id=' + encodeURIComponent(record.id));
      const next = fieldsFor(record);
      setSaved(record);
      setFields(next);
      setBaseline(JSON.stringify(next));
      setCandidate(undefined);
      setFilename(record.originalFilename);
      setLibrary((current) => [...current.filter((snippet) => snippet.id !== record.id), record]);
      setPractice(tryIt);
      setNotice('Saved on this device. Your shortcut is ready to try in practice.');
      void checkMedia();
    } catch (error) {
      if (active.current) setError(message(error));
    } finally {
      submitting.current = false;
      if (active.current) setSaving(false);
    }
  };
  const action = (what: 'close' | 'reload') => {
    if (busy) return;
    if (dirty) {
      setPending(what);
      return;
    }
    if (what === 'reload') void load();
    else window.close();
  };
  const download = async () => {
    if (!saved) return;
    setError('');
    try {
      const asset = await mediaSnippetService.readSelected(saved);
      const url = URL.createObjectURL(asset.original),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = saved.originalFilename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Original file download started. Check your Downloads folder.');
    } catch (error) {
      setError(message(error));
    }
  };
  const field = (name: keyof typeof empty, value: string) => {
    setFields((fields) => ({ ...fields, [name]: value }));
    setNotice('');
  };
  return (
    <main className="media-editor-page">
      <header className="media-topbar">
        <a className="media-brand" href="#top" aria-label="Fillin visual snippets, back to top">
          <img src="/icon48.png" alt="" />
          Fillin<span>Visual snippets</span>
        </a>
        <button
          type="button"
          className="media-text-button"
          disabled={busy}
          onClick={() => action('close')}
        >
          Close editor
        </button>
      </header>
      <div id="top" className="media-workspace">
        <div className="media-intro">
          <div>
            <span className="media-eyebrow">YOUR VISUAL LIBRARY</span>
            <h1>{saved ? 'An image worth keeping.' : 'Your image. One shortcut away.'}</h1>
            <p>Give a useful image or GIF a shortcut, then try it in your own little workspace.</p>
          </div>
          <span className="media-local-badge">Saved locally</span>
        </div>
        <div className="media-release-note">
          Preview before inserting on supported rich-text fields. Other editors offer manual copy or
          download options. Export a full ZIP backup to keep your original files and shortcuts
          together.
        </div>
        {!loading && (
          <div className="media-backup-row">
            <span>
              {dirty
                ? 'Save your draft before managing backups.'
                : 'Back up or restore your saved library.'}
            </span>
            <div className="library-tools">
              <BackupControls
                snippets={library}
                disabled={busy || dirty || !!loadError}
                onNotice={(text, failed) => (failed ? setError(text) : setNotice(text))}
                onChanged={load}
              />
            </div>
          </div>
        )}
        {loading ? (
          <p role="status" className="media-panel">
            Opening your visual workspace…
          </p>
        ) : (
          <>
            {loadError && (
              <div role="alert" className="media-error">
                {loadError}{' '}
                <button type="button" onClick={() => action('reload')}>
                  Retry loading
                </button>
              </div>
            )}
            {stale && !loadError && (
              <div role="alert" className="media-error">
                This shortcut changed in another window. Your draft is still here.{' '}
                <button type="button" onClick={() => action('reload')}>
                  Reload latest
                </button>
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save(false);
              }}
              className="media-editor-form"
            >
              <fieldset disabled={busy || !!loadError} className="media-editor-grid">
                <section
                  className="media-panel media-file-panel"
                  aria-labelledby="media-file-heading"
                >
                  <span className="media-eyebrow">01 / CHOOSE AN IMAGE</span>
                  <h2 id="media-file-heading">Keep something useful.</h2>
                  <div
                    className="media-drop-zone"
                    data-dragging={dragging}
                    aria-busy={preparing}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!busy) setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      if (!saving) void choose(event.dataTransfer.files);
                    }}
                  >
                    <input
                      ref={input}
                      id="media-file"
                      type="file"
                      accept="image/png,image/jpeg,image/gif,.png,.jpg,.jpeg,.gif"
                      className="media-file-input"
                      aria-label="Choose image or GIF"
                      onChange={(event) => {
                        if (event.target.files?.length) void choose(event.target.files);
                        event.target.value = '';
                      }}
                    />
                    {display ? (
                      <MediaPreview
                        key={display.assetId}
                        original={display.original}
                        thumbnail={display.thumbnail}
                        animated={display.mime === 'image/gif'}
                        alt={fields.alt}
                        onError={() =>
                          setAssetError(
                            'The preview could not be displayed. Replace the file or reload the image.'
                          )
                        }
                      />
                    ) : (
                      <div className="media-drop-empty">
                        <span aria-hidden="true">↥</span>
                        <strong>Drop an image or GIF here</strong>
                        <p>A diagram, a quick how-to, a favourite reaction.</p>
                      </div>
                    )}
                    <button
                      type="button"
                      className="popup-secondary"
                      onClick={() => input.current?.click()}
                    >
                      {display ? 'Replace file' : 'Choose file'}
                    </button>
                    <p className="media-help">PNG, JPEG or GIF · up to 10 MiB</p>
                  </div>
                  {display && (
                    <div className="media-file-details">
                      <strong>{filename}</strong>
                      <span>
                        {display.width} × {display.height} · {formatMediaSize(display.byteSize)} ·{' '}
                        {display.mime === 'image/gif'
                          ? `${display.frameCount} frames`
                          : display.mime === 'image/jpeg'
                            ? 'JPEG'
                            : 'PNG'}
                      </span>
                    </div>
                  )}
                  {assetError && (
                    <p role="alert" className="media-error">
                      {assetError}
                    </p>
                  )}
                </section>
                <section
                  className="media-panel media-fields"
                  aria-labelledby="media-details-heading"
                >
                  <span className="media-eyebrow">MAKE IT YOURS</span>
                  <h2 id="media-details-heading">Easy to find. Easy to reuse.</h2>
                  <label htmlFor="media-trigger">Shortcut</label>
                  <input
                    autoFocus
                    id="media-trigger"
                    className="popup-input media-trigger-input"
                    placeholder="/setup"
                    value={fields.trigger}
                    onChange={(event) => field('trigger', event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={duplicate}
                    aria-describedby="media-trigger-help"
                    required
                    maxLength={100}
                  />
                  <p id="media-trigger-help" className={duplicate ? 'media-error' : 'media-help'}>
                    {duplicate
                      ? 'This shortcut already exists. Choose another.'
                      : 'Begin with /, then use letters, numbers, dashes or underscores.'}
                  </p>
                  <label htmlFor="media-tags">
                    Tags <span>optional</span>
                  </label>
                  <input
                    id="media-tags"
                    className="popup-input"
                    placeholder="support, setup"
                    value={fields.tags}
                    onChange={(event) => field('tags', event.target.value)}
                    maxLength={330}
                  />
                  <p className="media-help">
                    Separate tags with commas. Use them to organize your library.
                  </p>
                  <label htmlFor="media-caption">
                    Caption <span>optional</span>
                  </label>
                  <textarea
                    id="media-caption"
                    className="popup-input"
                    rows={4}
                    placeholder="Follow the highlighted steps below."
                    value={fields.caption}
                    maxLength={MEDIA_LIMITS.caption}
                    onChange={(event) => field('caption', event.target.value)}
                  />
                  <p className="media-help">
                    Appears below your image when you include it. {fields.caption.length} / 2,000
                  </p>
                  <label htmlFor="media-alt">
                    Image description <span>optional</span>
                  </label>
                  <input
                    id="media-alt"
                    className="popup-input"
                    placeholder="Settings menu with the reset button highlighted"
                    value={fields.alt}
                    maxLength={MEDIA_LIMITS.alt}
                    onChange={(event) => field('alt', event.target.value)}
                  />
                  <p className="media-help">
                    Describe instructional images for people using screen readers.
                  </p>
                </section>
              </fieldset>
              {preparing && (
                <div className="media-progress" role="status">
                  Checking your file and making a still preview…{' '}
                  <button
                    type="button"
                    onClick={() => {
                      operation.current++;
                      preparation.current?.abort();
                      setPreparing(false);
                    }}
                  >
                    Cancel preparation
                  </button>
                </div>
              )}
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
              <div className="media-save-bar">
                <span className="media-help">
                  {usage || 'Your files stay in this browser.'}
                  {dirty && <strong> · Unsaved changes</strong>}
                </span>
                <div>
                  {saved && (
                    <button
                      type="button"
                      className="media-text-button"
                      disabled={busy || stale || !!loadError}
                      onClick={() => void download()}
                    >
                      Download original
                    </button>
                  )}
                  <button type="submit" className="popup-secondary" disabled={!valid || busy}>
                    {saving ? 'Saving…' : 'Save image'}
                  </button>
                  <button
                    type="button"
                    className="popup-primary"
                    disabled={!valid || busy}
                    onClick={() => void save(true)}
                  >
                    Save and try
                  </button>
                </div>
              </div>
            </form>
            {saved && !dirty && !stale && !loadError && (
              <div ref={practiceSection}>
                {practice ? (
                  <MediaPractice key={saved.id + saved.updatedAt} snippet={saved} />
                ) : (
                  <button
                    type="button"
                    className="media-open-practice"
                    onClick={() => setPractice(true)}
                  >
                    Try {saved.trigger} in practice <span aria-hidden="true">↗</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {pending && (
        <Dialog titleId="discard-media-heading" onClose={() => setPending(null)}>
          <div className="media-preview-dialog">
            <h2 id="discard-media-heading">Discard your unsaved changes?</h2>
            <p>Your saved image will stay in your library.</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="popup-secondary"
                data-dialog-initial
                onClick={() => setPending(null)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="popup-danger"
                onClick={() => {
                  const action = pending;
                  setPending(null);
                  if (action === 'reload') void load();
                  else {
                    allowClose.current = true;
                    window.close();
                  }
                }}
              >
                Discard changes
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </main>
  );
}
