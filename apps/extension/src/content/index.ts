import { detectTrigger, Snippet } from '@fillin/shared';
import { AdapterFactory } from './adapters/AdapterFactory';
import { GoogleDocsAdapter } from './adapters/GoogleDocsAdapter';
import { expandSnippet } from './expansion/ExpansionCoordinator';
import { commandPalette } from './CommandPalette';
import { validateSnippetLibrary } from '../storage/validateSnippetLibrary';
import { SuggestionController } from './suggestions/SuggestionController';
import { SUGGESTIONS_KEY, parseSuggestions } from '../services/SuggestionSettings';
import { installSelectionGuard } from '../capture/selectionGuard';
import { cancelTemplateDialog, isTemplateDialogOpen } from './templates/TemplateDialog';
import { isInlineSessionActive, stopInlineSession } from './templates/InlineSession';
import { cancelMediaDialog, isMediaDialogOpen } from './media/MediaDialog';

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) installSelectionGuard();

let snippetsCache: Record<string, Snippet> = {};
let triggersCache: string[] = [];
let fullSnippetsCache: Snippet[] = [];
let blacklistedDomainsCache: string[] = [];

export function isSnippetCurrent(snippet: Snippet): boolean {
  return fullSnippetsCache.includes(snippet);
}

export function updateBlacklistCache(domains: string[]) {
  suggestions?.close();
  blacklistedDomainsCache = (domains || []).map((d) => d.toLowerCase().replace(/^www\./, ''));
  cancelTemplateDialog();
  cancelMediaDialog();
  stopInlineSession();
}

export function isCurrentSiteBlacklisted(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase().replace(/^www\./, '');
  if (!host) return false;
  return blacklistedDomainsCache.some((d) => host === d || host.endsWith('.' + d));
}

export function updateCache(
  snippets: (Snippet | { trigger: string; content: string; isHtml?: boolean; tags?: string[] })[]
) {
  stopInlineSession();
  cancelTemplateDialog();
  suggestions?.close();
  snippetsCache = {};
  triggersCache = [];
  cancelMediaDialog();
  fullSnippetsCache = (snippets || []).map((s, idx) => 'kind' in s && s.kind === 'media' ? s : ({
    id: (s as Snippet).id || String(idx),
    trigger: s.trigger,
    content: s.content,
    isHtml: !!s.isHtml,
    tags: (s as Snippet).tags,
    templateVersion: (s as Snippet).templateVersion,
    dateFormat: (s as Snippet).dateFormat,
    editAfterInsert: (s as Snippet).editAfterInsert,
    createdAt: (s as Snippet).createdAt || Date.now(),
    updatedAt: (s as Snippet).updatedAt || Date.now(),
  }));

  for (const s of fullSnippetsCache) {
    snippetsCache[s.trigger] = s;
    triggersCache.push(s.trigger);
  }

  commandPalette.updateSnippets(fullSnippetsCache);
}

export function updateStoredSnippetCache(value: unknown) {
  try {
    updateCache(validateSnippetLibrary(value === undefined ? [] : value));
  } catch {
    // Disable expansion of unreadable data without changing persistent storage.
    // The popup provides the error message and retry action.
    updateCache([]);
  }
}

export function getDeepActiveElement(root: Document | ShadowRoot = document): Element | null {
  const activeEl = root.activeElement;
  if (!activeEl) return null;
  if (activeEl.shadowRoot && activeEl.shadowRoot.activeElement) {
    return getDeepActiveElement(activeEl.shadowRoot);
  }
  return activeEl;
}

export function getTargetElement(e?: KeyboardEvent): Element | null {
  if (e && e.composedPath && typeof e.composedPath === 'function') {
    const path = e.composedPath();
    if (path.length > 0 && path[0] instanceof Element) {
      return path[0];
    }
  }
  const deep = getDeepActiveElement();
  if (deep) return deep;
  if (e && e.target instanceof Element) {
    return e.target;
  }
  return null;
}

const suggestions = typeof document === 'undefined' ? null : new SuggestionController({
  snippets: () => fullSnippetsCache,
  allowed: () => !isCurrentSiteBlacklisted(),
  target: () => getDeepActiveElement(),
  paletteOpen: () => commandPalette.isOpen() || isTemplateDialogOpen() || isMediaDialogOpen() || isInlineSessionActive(),
});
function applySuggestions(value: unknown) {
  try { suggestions?.setEnabled(parseSuggestions(value)); }
  catch { suggestions?.setEnabled(false); }
}

export function handleKeyDown(e: KeyboardEvent) {
  if (isTemplateDialogOpen() || isMediaDialogOpen()) return;
  if (isCurrentSiteBlacklisted()) return;

  const targetEl = getTargetElement(e);

  // Shortcut 1: In-Page Command Palette (Ctrl+Shift+K or Cmd+Shift+K or Cmd+/)
  const isPaletteShortcut =
    ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'k' || e.code === 'KeyK')) ||
    ((e.metaKey || e.ctrlKey) && e.key === '/' && !e.shiftKey && !e.altKey);

  if (isInlineSessionActive()) {
    if (isPaletteShortcut || e.ctrlKey && e.code === 'Space') stopInlineSession();
    else return;
  }

  if (isPaletteShortcut) {
    suggestions?.close();
    e.preventDefault();
    e.stopPropagation();
    if (typeof window !== 'undefined' && window.self !== window.top) {
      try {
        window.top?.postMessage({ type: 'FILLIN_OPEN_PALETTE' }, '*');
      } catch {
        commandPalette.open(targetEl);
      }
    } else {
      commandPalette.open(targetEl);
    }
    return;
  }

  // Google Docs buffer recording (for printable characters & Backspace)
  if (GoogleDocsAdapter.isGoogleDocs() && GoogleDocsAdapter.isDocsCanvas(targetEl)) {
    if (e.key === 'Backspace') {
      GoogleDocsAdapter.getInstance().recordKey('Backspace');
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      GoogleDocsAdapter.getInstance().recordKey(e.key);
    }
  }

  // Shortcut 2: Trigger expansion (Ctrl + Space)
  if (!(e.ctrlKey && e.code === 'Space')) return;

  const adapter = AdapterFactory.getAdapter(targetEl);

  if (adapter) {
    const text = adapter.getText();
    const cursor = adapter.getCursorPosition();

    if (cursor === null) return;

    const detection = detectTrigger(text, cursor, triggersCache);
    if (detection) {
      const snippet = snippetsCache[detection.trigger];
      if (snippet?.kind === 'media' && !e.isTrusted) return;
      if (snippet !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        void expandSnippet(adapter, snippet, detection.start, detection.end, () => !isCurrentSiteBlacklisted() && !!targetEl?.isConnected && isSnippetCurrent(snippet));
      }
    }
  }
}

export function initGoogleDocsObserver() {
  if (typeof document === 'undefined' || !GoogleDocsAdapter.isGoogleDocs()) return;

  const attachToIframe = () => {
    const iframe = document.querySelector('iframe.docs-texteventtarget-iframe') as HTMLIFrameElement | null;
    if (iframe && iframe.contentDocument) {
      try {
        iframe.contentDocument.removeEventListener('keydown', handleKeyDown, true);
        iframe.contentDocument.addEventListener('keydown', handleKeyDown, true);
      } catch {
        // Cross-origin fallback
      }
    }
  };

  attachToIframe();

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      attachToIframe();
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
}

// Initialize only in actual browser environment
if (typeof document !== 'undefined') {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    let suggestionRevision = 0;
    chrome.storage.local.get(['fillin_snippets', 'fillin_blacklist', SUGGESTIONS_KEY], (result) => {
      if (chrome.runtime?.lastError) return;
      updateStoredSnippetCache(result['fillin_snippets']);
      updateBlacklistCache(result['fillin_blacklist'] || []);
      if (!suggestionRevision) applySuggestions(result[SUGGESTIONS_KEY]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes[SUGGESTIONS_KEY]) {
          suggestionRevision++;
          applySuggestions(changes[SUGGESTIONS_KEY].newValue);
        }
        if (changes['fillin_snippets']) {
          updateStoredSnippetCache(changes['fillin_snippets'].newValue);
        }
        if (changes['fillin_blacklist']) {
          updateBlacklistCache(changes['fillin_blacklist'].newValue || []);
        }
      }
    });
  } else {
    try {
      const data = localStorage.getItem('fillin_snippets');
      updateStoredSnippetCache(data === null ? undefined : JSON.parse(data));
      const bData = localStorage.getItem('fillin_blacklist');
      if (bData) updateBlacklistCache(JSON.parse(bData));
      const settings = localStorage.getItem(SUGGESTIONS_KEY);
      applySuggestions(settings === null ? undefined : JSON.parse(settings));
    } catch {
      updateCache([]);
    }
  }

  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('fillin-template-open', () => { stopInlineSession(); suggestions?.close(); if (commandPalette.isOpen()) commandPalette.close(); });
  document.addEventListener('fillin-inline-open', () => { suggestions?.close(); if (commandPalette.isOpen()) commandPalette.close(); });
  document.addEventListener('fillin-media-open', () => { stopInlineSession(); cancelTemplateDialog(); suggestions?.close(); if (commandPalette.isOpen()) commandPalette.close(); });
  initGoogleDocsObserver();

  if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'FILLIN_OPEN_PALETTE') {
        if (isTemplateDialogOpen() || isMediaDialogOpen()) return;
        suggestions?.close();
        const activeTarget = getTargetElement() || document.activeElement;
        commandPalette.open(activeTarget);
      }
    });
  }
}
