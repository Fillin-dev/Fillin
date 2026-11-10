import React, { useState, useEffect, useMemo } from 'react';
import { Snippet } from '@fillin/shared';
import { ArrowLeft, Save, X, AlertTriangle, Check } from 'lucide-react';

interface Props {
  snippet?: Snippet;
  existingSnippets?: Snippet[];
  onSave: (trigger: string, content: string, isHtml: boolean, tags?: string[]) => Promise<void>;
  onCancel: () => void;
  error?: string | null;
}

export function SnippetForm({ snippet, existingSnippets, onSave, onCancel, error }: Props) {
  const [trigger, setTrigger] = useState(snippet?.trigger || '/');
  const [content, setContent] = useState(snippet?.content || '');
  const [isHtml, setIsHtml] = useState(snippet?.isHtml || false);
  const [tags, setTags] = useState<string[]>(snippet?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setLocalError(error || null);
  }, [error]);

  // Check duplicate and prefix conflicts in real time
  const conflict = useMemo(() => {
    const clean = trigger.trim();
    if (!clean || clean === '/' || !existingSnippets) {
      return { type: 'none' as const, message: '', suggestions: [] as string[] };
    }

    const otherSnippets = existingSnippets.filter((s) => s.id !== snippet?.id);

    // 1. Exact Duplicate Conflict
    const duplicate = otherSnippets.find((s) => s.trigger.toLowerCase() === clean.toLowerCase());
    if (duplicate) {
      const base = clean.startsWith('/') ? clean.slice(1) : clean;
      const suggestions = [`/${base}2`, `/${base}_alt`, `/my${base}`].filter(
        (cand) => !otherSnippets.some((s) => s.trigger.toLowerCase() === cand.toLowerCase())
      );

      return {
        type: 'duplicate' as const,
        message: `Trigger "${clean}" already exists. Choose a unique shortcut.`,
        suggestions,
      };
    }

    // 2. Prefix / Overlap Conflict
    const prefixOverlap = otherSnippets.find(
      (s) =>
        (clean.toLowerCase().startsWith(s.trigger.toLowerCase()) &&
          clean.length > s.trigger.length) ||
        (s.trigger.toLowerCase().startsWith(clean.toLowerCase()) && s.trigger.length > clean.length)
    );

    if (prefixOverlap) {
      const base = clean.startsWith('/') ? clean.slice(1) : clean;
      const suggestions = [`/${base}_`, `/${base}1`].filter(
        (cand) => !otherSnippets.some((s) => s.trigger.toLowerCase() === cand.toLowerCase())
      );

      return {
        type: 'prefix' as const,
        message: `Shares prefix with "${prefixOverlap.trigger}". Both shortcuts work when typed in full.`,
        suggestions,
      };
    }

    return { type: 'none' as const, message: '', suggestions: [] as string[] };
  }, [trigger, existingSnippets, snippet]);

  const validTrigger = /^\/[a-zA-Z0-9_-]+$/.test(trigger);
  const isValid = validTrigger && content.trim().length > 0 && conflict.type !== 'duplicate';

  const handleAddTag = (val: string) => {
    const clean = val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    if (clean && !tags.includes(clean)) {
      setTags((current) => (current.includes(clean) ? current : [...current, clean]));
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setLocalError(null);
    setIsSubmitting(true);
    try {
      const pendingTag = tagInput
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      const savedTags = pendingTag ? Array.from(new Set([...tags, pendingTag])) : tags;
      await onSave(trigger, content, isHtml, savedTags.length ? savedTags : undefined);
      onCancel();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="popup-editor">
      <header className="editor-header">
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="icon-button"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>{snippet ? 'Edit Snippet' : 'New Snippet'}</h1>
          <p>{snippet ? 'Fine-tune your saved shortcut.' : 'A few letters. Your full message.'}</p>
        </div>
      </header>
      <form onSubmit={handleSubmit} className="snippet-form" aria-busy={isSubmitting}>
        <div className="editor-scroll">
          {localError && (
            <div role="alert" className="form-error">
              {localError}
            </div>
          )}
          <div className="form-field">
            <label htmlFor="snippet-trigger">Shortcut</label>
            <div className="trigger-input">
              <span aria-hidden="true">/</span>
              <input
                id="snippet-trigger"
                type="text"
                value={trigger.replace(/^\//, '')}
                onChange={(event) => setTrigger('/' + event.target.value.replace(/\//g, ''))}
                placeholder="email, name, sig..."
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={isSubmitting}
                aria-describedby="trigger-help"
                aria-invalid={conflict.type === 'duplicate' || (trigger !== '/' && !validTrigger)}
              />
            </div>
            <p id="trigger-help" className="field-help">
              {trigger === '/' ? (
                'Letters, numbers, dashes and underscores.'
              ) : !validTrigger ? (
                'Use only letters, numbers, dashes and underscores.'
              ) : conflict.type === 'none' ? (
                <span className="available-trigger">
                  <Check size={12} /> Shortcut available
                </span>
              ) : null}
            </p>
            {conflict.type !== 'none' && (
              <div
                className={conflict.type === 'duplicate' ? 'form-error' : 'form-warning'}
                role={conflict.type === 'duplicate' ? 'alert' : 'status'}
              >
                <p className="flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{conflict.message}</span>
                </p>
                {conflict.suggestions.length > 0 && (
                  <div className="trigger-suggestions">
                    <span>Try:</span>
                    {conflict.suggestions.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => setTrigger(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-field">
            <div className="field-label-row">
              <label htmlFor="snippet-content">Expanded text</label>
              <span>{content.length.toLocaleString()} characters</span>
            </div>
            <textarea
              id="snippet-content"
              className="popup-input snippet-content-input"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="The text that will be inserted..."
              disabled={isSubmitting}
            />
            <p className="field-help">
              This replaces your shortcut when you press <kbd>Ctrl + Space</kbd>.
            </p>
          </div>

          <div className="form-field">
            <label htmlFor="snippet-tags">
              Tags <span className="optional-label">Optional</span>
            </label>
            <div className="tag-input-row">
              <input
                id="snippet-tags"
                className="popup-input"
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => {
                  if (tagInput.trim()) handleAddTag(tagInput);
                }}
                placeholder="Add tag and press Enter (e.g. email, work)..."
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="popup-secondary"
                disabled={!tagInput.trim() || isSubmitting}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleAddTag(tagInput)}
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="form-tags">
                {tags.map((tag) => (
                  <span key={tag}>
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      disabled={isSubmitting}
                      aria-label={'Remove tag ' + tag}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <label htmlFor="htmlToggle" className="format-option">
            <input
              id="htmlToggle"
              type="checkbox"
              checked={isHtml}
              onChange={(event) => setIsHtml(event.target.checked)}
              disabled={isSubmitting}
            />
            <span>
              <strong>Rich text (HTML)</strong>
              <small>Enable only when your snippet contains HTML.</small>
            </span>
          </label>
        </div>
        <footer className="editor-footer">
          <button type="submit" disabled={isSubmitting || !isValid} className="popup-primary">
            <Save size={16} aria-hidden="true" />
            {isSubmitting ? 'Saving...' : snippet ? 'Update Snippet' : 'Save Snippet'}
          </button>
          <p>Saved locally in your browser.</p>
        </footer>
      </form>
    </div>
  );
}
