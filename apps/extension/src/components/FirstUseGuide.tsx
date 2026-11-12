import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { detectTrigger, replaceTrigger, Snippet } from '@fillin/shared';
import { snippetService } from '../services';
import { readFirstUse, saveFirstUse } from '../storage/firstUse';
import { exportBackup } from '../utils/exportBackup';
import { exportFullBackup } from '../backup';

interface Props {
  snippets: Snippet[];
  onClose: () => Promise<void>;
  children: React.ReactNode;
}

const buttonClass = 'popup-primary';
const fieldClass = 'popup-input';

export function FirstUseGuide({ snippets, onClose, children }: Props) {
  const [mode, setMode] = useState<'loading' | 'guide' | 'library' | 'error'>('loading');
  const firstText = snippets.find(snippet => snippet.kind !== 'media');
  const [snippet, setSnippet] = useState<Snippet | undefined>(firstText);
  const [step, setStep] = useState<1 | 2 | 3>(firstText ? 2 : 1);
  const [trigger, setTrigger] = useState('hello');
  const [content, setContent] = useState('Hello there!');
  const [practice, setPractice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const practiceRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);
  const initialSnippets = useRef(snippets);

  useLayoutEffect(() => {
    if (pendingCursor.current !== null && practiceRef.current) {
      practiceRef.current.focus();
      practiceRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current);
      pendingCursor.current = null;
    }
  });

  const load = async () => {
    setMode('loading');
    try {
      const status = await readFirstUse();
      setMode(
        status === 'active' || (status === undefined && !initialSnippets.current.length)
          ? 'guide'
          : 'library'
      );
    } catch {
      setMode('error');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const close = () =>
    run(async () => {
      await saveFirstUse('done');
      await onClose();
      setMode('library');
    });

  const expand = () => {
    const field = practiceRef.current;
    if (!field || !snippet) return;
    const detection = detectTrigger(field.value, field.selectionStart, [snippet.trigger]);
    if (!detection || field.selectionStart !== field.selectionEnd) {
      setError(`Type ${snippet.trigger} and place the cursor just after it, then try again.`);
      return;
    }
    // Use the same detection and replacement engine as expansion on websites.
    const result = replaceTrigger(field.value, detection, snippet.content);
    pendingCursor.current = result.cursorPosition;
    setPractice(result.text);
    setExpanded(true);
    setError(null);
  };

  if (mode === 'library') return <>{children}</>;
  if (mode === 'loading')
    return (
      <p role="status" className="p-6 text-sm text-gray-500">
        Loading your guide…
      </p>
    );
  if (mode === 'error')
    return (
      <div className="p-6 space-y-4">
        <p role="alert" className="text-sm">
          Could not load your guide progress. Your snippets have not been changed.
        </p>
        <button className={buttonClass} onClick={() => void load()}>
          Try again
        </button>
      </div>
    );

  const normalizedTrigger = '/' + trigger.replace(/^\//, '');
  const valid = /^\/[a-zA-Z0-9_-]+$/.test(normalizedTrigger) && Boolean(content.trim());

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
        <span className="font-bold text-gray-900">Welcome to Fillin</span>
        <button
          disabled={busy}
          onClick={() => void close()}
          className="text-xs text-gray-500 underline rounded focus:ring-2 focus:ring-gray-400"
        >
          Skip guide
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="guide-progress" aria-hidden="true">
          {[1, 2, 3].map((value) => (
            <span key={value} data-active={value <= step} />
          ))}
        </div>
        <p className="text-xs font-semibold text-gray-500">
          Step {step} of 3 · Create → Practice → Back up
        </p>
        {step === 1 && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid || busy) return;
              void run(async () => {
                // Record the active guide before saving, so closing the popup can resume it.
                await saveFirstUse('active');
                const saved = await snippetService.createSnippet(normalizedTrigger, content);
                setSnippet(saved);
                setStep(2);
              });
            }}
          >
            <h1 className="text-lg font-semibold text-gray-900">Create your first shortcut</h1>
            <p className="text-sm text-gray-500">
              A short trigger expands into text you use often. Try this example or make it your own.
            </p>
            <label className="block text-sm font-medium" htmlFor="first-trigger">
              Shortcut
            </label>
            <div className="flex items-center gap-2">
              <span aria-hidden="true">/</span>
              <input
                id="first-trigger"
                className={fieldClass}
                value={trigger}
                onChange={(event) => setTrigger(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <p className="text-xs text-gray-500">Use letters, numbers, dashes or underscores.</p>
            <label className="block text-sm font-medium" htmlFor="first-content">
              Expanded text
            </label>
            <textarea
              id="first-content"
              rows={2}
              className={fieldClass}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
            />
            <button className={buttonClass} disabled={!valid || busy}>
              {busy ? 'Saving…' : 'Save shortcut'}
            </button>
          </form>
        )}
        {step === 2 && snippet && (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold text-gray-900">Try your shortcut</h1>
            <p className="text-sm text-gray-500">
              Your shortcut is saved. Type{' '}
              <strong className="font-mono text-gray-900">{snippet.trigger}</strong> below, then
              press <strong>Ctrl + Space</strong> (Control on Mac too).
            </p>
            <label htmlFor="first-practice" className="block text-sm font-medium">
              Practice field
            </label>
            <textarea
              id="first-practice"
              ref={practiceRef}
              rows={3}
              className={fieldClass}
              value={practice}
              onChange={(event) => {
                setPractice(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.ctrlKey && event.code === 'Space' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  expand();
                }
              }}
            />
            <button
              onClick={expand}
              className="text-sm font-semibold underline focus:ring-2 focus:ring-gray-400 rounded"
            >
              Expand shortcut
            </button>
            {expanded && (
              <p role="status" className="text-sm text-emerald-700">
                It worked! You can use this shortcut in website text fields too.
              </p>
            )}
            <p className="text-xs text-gray-500">
              This practice field stays inside Fillin. It does not add to your usage statistics.
              Password fields are excluded on websites.
            </p>
            <button
              className={buttonClass}
              disabled={!expanded || busy}
              onClick={() => {
                setError(null);
                setStep(3);
              }}
            >
              Continue to backup
            </button>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold text-gray-900">Keep a backup</h1>
            <p className="text-sm text-gray-500">
              Your snippets are saved in this browser. Export a JSON backup before removing Fillin
              or moving to another browser.
            </p>
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const saved = await snippetService.getSnippets();
                  if (saved.some(snippet => snippet.kind === 'media')) await exportFullBackup();
                  else exportBackup(saved);
                  setDownloadRequested(true);
                })
              }
            >
              Export backup
            </button>
            {downloadRequested && (
              <p role="status" className="text-sm text-emerald-700">
                Download requested. Check your Downloads folder for the JSON file.
              </p>
            )}
            <p className="text-sm text-gray-500">
              Later, use <strong>Export snippets</strong> at the top of your library. To restore a
              backup, choose <strong>Import snippets</strong> and select the JSON file.
            </p>
            <button
              disabled={busy}
              onClick={() => void close()}
              className="w-full py-2 text-sm font-semibold underline focus:ring-2 focus:ring-gray-400 rounded"
            >
              Finish setup
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
