import React, { useEffect, useRef, useState } from 'react';
import { Snippet, TemplateOptions } from '@fillin/shared';
import { SnippetForm } from '../components/SnippetForm';
import { snippetService } from '../services';
import { isCaptureId } from './CaptureDrafts';

function suggestTrigger(text: string, snippets: Snippet[]): string {
  const base = (text.trim().match(/^[a-z0-9][a-z0-9_-]*/i)?.[0] || 'snippet').slice(0, 24).toLowerCase();
  let trigger = '/' + base;
  let suffix = 2;
  while (snippets.some((s) => s.trigger.toLowerCase() === trigger)) trigger = `/${base}${suffix++}`;
  return trigger;
}

export function CaptureEditor() {
  const params = new URLSearchParams(location.search);
  const id = params.get('capture');
  const [loaded, setLoaded] = useState<{ text: string; snippets: Snippet[] } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const windowId = useRef<number>();
  const saved = useRef(false);
  const [persisted, setPersisted] = useState(false);
  const [closing, setClosing] = useState(false);

  const request = async (type: 'FILLIN_CAPTURE_READ' | 'FILLIN_CAPTURE_DISCARD') => {
    if (!isCaptureId(id)) throw new Error('Select text on a webpage and choose “Save selection to Fillin” again.');
    const response = await chrome.runtime.sendMessage({ type, id, windowId: windowId.current });
    if (!response?.ok) throw new Error(response?.error || 'The selection could not be loaded. Please retry.');
    return response;
  };

  useEffect(() => {
    let current = true;
    const load = async () => {
      setError('');
      if (params.has('captureError')) throw new Error(params.get('captureError') === 'blocked'
        ? 'Fillin is disabled on this website. You can change blocked websites in the extension.'
        : 'Could not capture this selection. Select less than 100,000 characters on a regular webpage and try again. Protected fields and unavailable pages cannot be captured.');
      windowId.current = (await chrome.windows.getCurrent()).id;
      const { text } = await request('FILLIN_CAPTURE_READ');
      const snippets = await snippetService.getSnippets();
      if (current) setLoaded({ text, snippets });
    };
    void load().catch((e) => { if (current) setError(e instanceof Error ? e.message : 'Could not load this selection.'); });
    return () => { current = false; };
  }, [attempt]);

  const cancel = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await request('FILLIN_CAPTURE_DISCARD');
      window.close();
    } catch {
      setError('Could not clear the temporary draft. Retry, or close this window to discard it.');
      setClosing(false);
    }
  };

  const save = async (trigger: string, content: string, isHtml: boolean, tags?: string[], template?: TemplateOptions) => {
    if (closing) throw new Error('The selection editor is closing.');
    // A cleanup retry must not save the same snippet twice.
    if (!saved.current) {
      await snippetService.createSnippet(trigger, content, isHtml, tags, template);
      saved.current = true;
      setPersisted(true);
      setError('Your snippet is saved. Finishing…');
    }
    try { await request('FILLIN_CAPTURE_DISCARD'); }
    catch {
      setError('Your snippet was saved. Retry clearing the temporary draft, or close this window.');
      throw new Error('Your snippet was saved.');
    }
    window.close();
  };

  if (persisted) return <main className="capture-status">
    <span className="capture-eyebrow">SAVED TO FILLIN</span>
    <h1>Your shortcut is ready.</h1>
    <p role="status">{error}</p>
    <button onClick={() => { void cancel(); }}>Finish</button>
    <button onClick={() => window.close()}>Close</button>
  </main>;

  if (!loaded) return <main className="capture-status">
    <span className="capture-eyebrow">FILLIN / SAVE SELECTION</span>
    <h1>Keep a useful piece of text.</h1>
    <p role={error ? 'alert' : 'status'}>{error || 'Opening your selection…'}</p>
    {error && !params.has('captureError') && <button onClick={() => setAttempt((n) => n + 1)}>Try again</button>}
    <button onClick={() => window.close()}>Close</button>
  </main>;
  return <main className="capture-shell" aria-busy={closing}>
    <div className="capture-note">Saved text stays on this device. Choose a shortcut to keep it.</div>
    <SnippetForm initialContent={loaded.text} initialTrigger={suggestTrigger(loaded.text, loaded.snippets)} existingSnippets={loaded.snippets} error={error}
      onSave={save} onCancel={() => { if (saved.current) window.close(); else void cancel(); }} />
  </main>;
}
