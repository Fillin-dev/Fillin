import React, { useEffect, useRef, useState } from 'react';
import { Snippet } from '@fillin/shared';
import {
  Search,
  Edit2,
  Trash2,
  Sparkles,
  Shield,
  ShieldAlert,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { BackupControls } from './BackupControls';
import { MediaThumbnail, MediaLibraryStatus } from './MediaThumbnail';

interface Props {
  snippets: Snippet[];
  onEdit: (snippet: Snippet) => void;
  onDelete: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onLoadStarterPack?: () => Promise<void>;
  onImport?: (data: unknown[]) => Promise<{ imported: number; updated: number; skipped: number }>;
  onOpenBlacklistModal?: () => void;
  currentDomain?: string | null;
  isCurrentDomainBlacklisted?: boolean;
  onToggleCurrentDomain?: () => void;
  onChanged?: () => Promise<void>;
}

function previewText(snippet: Snippet) {
  if (snippet.kind === 'media') return snippet.caption || snippet.originalFilename;
  if (!snippet.isHtml) return snippet.content;
  // A detached template keeps HTML inert: previews never execute saved markup.
  const template = document.createElement('template');
  template.innerHTML = snippet.content.replace(/<br\s*\/?>|<\/(?:div|p|li)>/gi, '\n');
  template.content.querySelectorAll('script, style, noscript').forEach((node) => node.remove());
  return template.content.textContent?.trim() || 'Rich-text snippet';
}

export function SnippetList({
  snippets,
  onEdit,
  onDelete,
  searchQuery,
  setSearchQuery,
  onLoadStarterPack,
  onImport,
  onOpenBlacklistModal,
  currentDomain,
  isCurrentDomainBlacklisted,
  onToggleCurrentDomain,
  onChanged,
}: Props) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [kind, setKind] = useState<'all' | 'text' | 'media'>('all');
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const allTags = Array.from(new Set(snippets.flatMap((s) => s.tags || []).filter(Boolean))).sort();
  const activeTag = selectedTag && allTags.includes(selectedTag) ? selectedTag : null;
  const query = searchQuery.trim().toLowerCase();
  const filtered = snippets.filter(
    (s) =>
      (kind === 'all' || (kind === 'media' ? s.kind === 'media' : s.kind !== 'media')) &&
      (!query ||
        s.trigger.toLowerCase().includes(query) ||
        s.content.toLowerCase().includes(query) ||
        (s.kind === 'media' &&
          [s.caption, s.alt, s.originalFilename].some((value) =>
            value.toLowerCase().includes(query)
          )) ||
        s.tags?.some((tag) => tag.toLowerCase().includes(query))) &&
      (!activeTag || s.tags?.includes(activeTag))
  );

  const showNotice = (text: string, error = false) => {
    clearTimeout(noticeTimer.current);
    setNotice({ text, error });
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  };
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTag(null);
    setKind('all');
  };

  return (
    <div className="library-view">
      <header className="library-header">
        <div className="library-brand-row">
          <div className="popup-brand">
            <img src="/icon48.png" alt="" />
            <div>
              <span>Fillin</span>
              <small>Your local library</small>
            </div>
          </div>
          <div className="library-tools">
            <BackupControls snippets={snippets} onNotice={showNotice} onLegacyImport={onImport} onChanged={onChanged} />
            {onOpenBlacklistModal && (
              <button
                className="icon-button"
                data-paused={isCurrentDomainBlacklisted}
                onClick={onOpenBlacklistModal}
                title="Site settings"
                aria-label="Manage site blacklist and pause settings"
              >
                {isCurrentDomainBlacklisted ? <ShieldAlert size={17} /> : <Shield size={17} />}
              </button>
            )}
          </div>
        </div>
        <div className="library-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search snippets"
            placeholder="Search snippets..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchQuery('');
            }}
            autoFocus
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {allTags.length > 0 && (
          <div className="library-tags" role="group" aria-label="Filter snippets by tag">
            <button
              className="filter-tag"
              aria-pressed={!activeTag}
              onClick={() => setSelectedTag(null)}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                className="filter-tag"
                aria-pressed={activeTag === tag}
                key={tag}
                title={'Filter #' + tag}
                onClick={() => setSelectedTag(activeTag === tag ? null : tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
        {isCurrentDomainBlacklisted && currentDomain && (
          <div className="site-paused">
            <ShieldAlert size={15} aria-hidden="true" />
            <span>
              Paused on <strong>{currentDomain}</strong>
            </span>
            {onToggleCurrentDomain && <button onClick={onToggleCurrentDomain}>Resume</button>}
          </div>
        )}
      </header>

      {snippets.some((snippet) => snippet.kind === 'media') && (
        <div className="media-type-filters" role="group" aria-label="Filter snippet types">
          {(['all', 'text', 'media'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {value === 'all' ? 'All' : value === 'text' ? 'Text' : 'Images & GIFs'}
            </button>
          ))}
        </div>
      )}

      {notice && (
        <div
          className={notice.error ? 'popup-notice is-error' : 'popup-notice'}
          role={notice.error ? 'alert' : 'status'}
        >
          <span>{notice.text}</span>
          <button
            className="icon-button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="library-caption">
        <h1>{query || activeTag || kind !== 'all' ? 'Filtered library' : 'Your library'}</h1>
        <span>
          {filtered.length}
          {filtered.length !== snippets.length ? ' of ' + snippets.length : ''} snippet
          {snippets.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="library-scroll">
        <MediaLibraryStatus snippets={snippets} />
        {filtered.length === 0 ? (
          <div className="library-empty">
            <div className="empty-icon">
              {snippets.length ? <SlidersHorizontal size={23} /> : <Sparkles size={23} />}
            </div>
            <h2>{snippets.length ? 'No results' : 'No snippets yet'}</h2>
            <p>
              {snippets.length
                ? 'Try a different search or clear your filters.'
                : 'Save something you type often, or begin with a few ready-made shortcuts.'}
            </p>
            {snippets.length ? (
              <button className="popup-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            ) : (
              onLoadStarterPack && (
                <button
                  className="popup-secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onLoadStarterPack();
                    } catch (err) {
                      showNotice(
                        err instanceof Error
                          ? err.message
                          : 'Could not load starter snippets. Try again.',
                        true
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Sparkles size={15} />
                  Load Starter Pack
                </button>
              )
            )}
          </div>
        ) : (
          <ul className="snippet-library" aria-label="Saved snippets">
            {filtered.map((snippet) => (
              <li className="snippet-card" key={snippet.id}>
                <div className="snippet-card-top">
                  <button
                    className="snippet-trigger"
                    onClick={() => onEdit(snippet)}
                    title={'Edit ' + snippet.trigger}
                  >
                    {snippet.trigger}
                  </button>
                  <div className="snippet-actions">
                    <button
                      className="icon-button"
                      onClick={() => onEdit(snippet)}
                      title="Edit snippet"
                      aria-label="Edit snippet"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="icon-button danger-icon"
                      onClick={() => onDelete(snippet.id)}
                      title="Delete snippet"
                      aria-label="Delete snippet"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {snippet.kind === 'media' ? (
                  <div className="media-card-content">
                    <MediaThumbnail snippet={snippet} />
                    <div>
                      <span className="media-format-badge">
                        {snippet.mime === 'image/gif' ? 'GIF' : 'Image'}
                      </span>
                      <p className="snippet-preview">{previewText(snippet)}</p>
                      <small>Open to edit & practise</small>
                    </div>
                  </div>
                ) : (
                  <p className="snippet-preview">{previewText(snippet)}</p>
                )}
                {snippet.isHtml || snippet.tags?.length ? (
                  <div className="snippet-metadata">
                    {snippet.isHtml && <span className="rich-text-badge">Rich text</span>}
                    {snippet.tags?.map((tag) => (
                      <span className="snippet-tag" title={'#' + tag} key={tag}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
