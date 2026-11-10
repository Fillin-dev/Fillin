import React, { useState } from 'react';
import { Shield, ShieldAlert, X, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { Dialog } from './Dialog';

interface Props {
  error?: string | null;
  isOpen?: boolean;
  onClose: () => void;
  blacklistedDomains: string[];
  currentDomain: string | null;
  isCurrentDomainBlacklisted: boolean;
  onToggleCurrentDomain: () => void | Promise<void>;
  onAddDomain: (domain: string) => void | boolean | Promise<void | boolean>;
  onRemoveDomain: (domain: string) => void | Promise<void>;
}

export function BlacklistModal({
  error,
  isOpen = true,
  onClose,
  blacklistedDomains,
  currentDomain,
  isCurrentDomainBlacklisted,
  onToggleCurrentDomain,
  onAddDomain,
  onRemoveDomain,
}: Props) {
  const [newDomain, setNewDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  if (!isOpen) return null;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setLocalError(null);
    try {
      await action();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not update site settings. Try again.'
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      titleId="sites-heading"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <header className="dialog-header">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-blue-600" />
          <div>
            <h2 id="sites-heading">Site settings</h2>
            <p>Choose where Fillin can expand.</p>
          </div>
        </div>
        <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close">
          <X size={17} />
        </button>
      </header>
      <div className="dialog-scroll">
        {(error || localError) && (
          <p role="alert" className="form-error">
            {error || localError}
          </p>
        )}
        {currentDomain && (
          <div className="site-status-card" data-paused={isCurrentDomainBlacklisted}>
            <div>
              {isCurrentDomainBlacklisted ? <ShieldAlert size={17} /> : <CheckCircle2 size={17} />}
              <strong>{currentDomain}</strong>
            </div>
            <p>
              {isCurrentDomainBlacklisted
                ? 'Expansion is paused on this site.'
                : 'Fillin is active on this site.'}
            </p>
            <button
              className="popup-secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await onToggleCurrentDomain();
                })
              }
            >
              {isCurrentDomainBlacklisted ? 'Resume' : 'Pause'}
            </button>
          </div>
        )}
        <form
          className="form-field"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newDomain.trim() || busy) return;
            try {
              const raw = newDomain.trim();
              const url = new URL(raw.includes('://') ? raw : 'https://' + raw);
              if (
                !['http:', 'https:'].includes(url.protocol) ||
                !url.hostname ||
                /\s/.test(raw) ||
                url.username ||
                url.password
              )
                throw new Error();
            } catch {
              setLocalError('Enter a website domain, such as example.com.');
              return;
            }
            void run(async () => {
              const success = await onAddDomain(newDomain.trim());
              if (success !== false) setNewDomain('');
            });
          }}
        >
          <label htmlFor="blocked-domain">Block a website</label>
          <div className="domain-input-row">
            <input
              id="blocked-domain"
              className="popup-input"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="e.g. chase.com, bank.org"
              value={newDomain}
              onChange={(event) => setNewDomain(event.target.value)}
              disabled={busy}
            />
            <button type="submit" className="popup-primary" disabled={!newDomain.trim() || busy}>
              <Plus size={15} />
              Add
            </button>
          </div>
          <p className="field-help">Subdomains are included, such as mail.example.com.</p>
        </form>
        <div>
          <div className="blocked-list-heading">
            <h3>Blocked websites</h3>
            <span>{blacklistedDomains.length}</span>
          </div>
          {!blacklistedDomains.length ? (
            <div className="blocked-empty">No blocked websites yet.</div>
          ) : (
            <ul className="blocked-list">
              {blacklistedDomains.map((domain) => (
                <li key={domain}>
                  <span>{domain}</span>
                  <button
                    className="icon-button danger-icon"
                    disabled={busy}
                    title={'Unblock ' + domain}
                    aria-label={'Unblock ' + domain}
                    onClick={() =>
                      void run(async () => {
                        await onRemoveDomain(domain);
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <footer className="dialog-footer">Paused sites keep their normal typing behavior.</footer>
    </Dialog>
  );
}
