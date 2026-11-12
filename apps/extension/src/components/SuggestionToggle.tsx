import React, { useEffect, useState } from 'react';
import {
  suggestionSettings,
  SUGGESTIONS_KEY,
  parseSuggestions,
} from '../services/SuggestionSettings';

export function SuggestionToggle() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setReady(false);
    try {
      setEnabled(await suggestionSettings.get());
      setReady(true);
      setError('');
    } catch {
      setError('Could not read suggestion settings. Try again.');
    }
  };
  useEffect(() => {
    void load();
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !(SUGGESTIONS_KEY in changes)) return;
      try {
        setEnabled(parseSuggestions(changes[SUGGESTIONS_KEY].newValue));
        setReady(true);
        setError('');
      } catch {
        setReady(false);
        setError('Could not read suggestion settings. Try again.');
      }
    };
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(changed);
      return () => chrome.storage.onChanged.removeListener(changed);
    }
  }, []);
  return (
    <div className="suggestion-setting">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!ready || busy}
          onChange={async (event) => {
            const next = event.target.checked;
            const previous = enabled;
            setEnabled(next);
            setBusy(true);
            try {
              await suggestionSettings.set(next);
              setEnabled(next);
              setError('');
            } catch {
              setEnabled(previous);
              setError('Could not save suggestion settings. Try again.');
            } finally {
              setBusy(false);
            }
          }}
        />
        <span>Suggest shortcuts while typing</span>
      </label>
      <p>Local suggestions in the active field. Off by default.</p>
      {error && (
        <p role="alert">
          {error}{' '}
          {!ready && (
            <button type="button" onClick={() => void load()}>
              Retry
            </button>
          )}
        </p>
      )}
    </div>
  );
}
